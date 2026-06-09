import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ledger, users, withdrawals, type Withdrawal } from "@/db/schema";

/**
 * Developer payouts. A developer can cash out the credits their apps have
 * *earned* (the `income` they were credited), turning them back into real money
 * an admin sends off-platform. Transferred-in, granted, and redeemed credits are
 * never withdrawable.
 *
 * Requesting a withdrawal escrows the amount via a `withdrawal` ledger debit, so
 * the credits leave the spendable balance immediately and can't be re-withdrawn
 * or spent. Rejecting (admin) or cancelling (developer) writes a matching
 * `withdrawal_refund` credit keyed on the same id, returning the escrow exactly
 * once. Marking it `paid` is a status-only change (the debit already happened).
 *
 * Balance safety mirrors the rest of the ledger: the user row is locked
 * (SELECT … FOR UPDATE) for the duration of each mutation so concurrent requests
 * can't over-withdraw, and ledger refs (`withdrawal:<id>` / `:refund`) are unique
 * so a refund can never be written twice.
 */

const SUM_DELTA = sql<number>`cast(coalesce(sum(${ledger.delta}), 0) as int)`;

/** Statuses that still tie up earned credits (excluded from "available"). */
const RESERVED_STATUSES = ["pending", "paid"] as const;

export interface WithdrawableEarnings {
  /** Lifetime credits the user earned as income from their apps. */
  earned: number;
  /** Earned credits locked in pending or already-paid withdrawals. */
  reserved: number;
  /** Current spendable balance (SUM of the ledger). */
  balance: number;
  /** What can be withdrawn now: max(0, min(balance, earned − reserved)). */
  available: number;
}

/**
 * How much a user may withdraw right now. Capped both by what they earned (never
 * transfers/top-ups) and by what they still hold, so spending earned credits
 * elsewhere lowers what's withdrawable.
 */
export async function getWithdrawableEarnings(
  userId: string,
): Promise<WithdrawableEarnings> {
  const db = getDb();

  const [earnedRow] = await db
    .select({ earned: SUM_DELTA })
    .from(ledger)
    .where(and(eq(ledger.userId, userId), eq(ledger.kind, "income")));
  const [balanceRow] = await db
    .select({ balance: SUM_DELTA })
    .from(ledger)
    .where(eq(ledger.userId, userId));
  const [reservedRow] = await db
    .select({
      reserved: sql<number>`cast(coalesce(sum(${withdrawals.amount}), 0) as int)`,
    })
    .from(withdrawals)
    .where(
      and(
        eq(withdrawals.userId, userId),
        inArray(withdrawals.status, [...RESERVED_STATUSES]),
      ),
    );

  const earned = earnedRow?.earned ?? 0;
  const balance = balanceRow?.balance ?? 0;
  const reserved = reservedRow?.reserved ?? 0;
  const available = Math.max(0, Math.min(balance, earned - reserved));
  return { earned, reserved, balance, available };
}

export type CreateWithdrawalResult =
  | { ok: true; withdrawal: Withdrawal; available: number }
  | { ok: false; reason: "invalid_amount" | "missing_details" }
  | { ok: false; reason: "exceeds_available"; available: number };

/**
 * Request a withdrawal of `amount` earned credits. Atomic and balance-safe: the
 * user row is locked while we recompute what's withdrawable, insert the request,
 * and write the escrow debit — so two concurrent requests can't both pass the
 * check and over-withdraw.
 */
export async function createWithdrawal(opts: {
  userId: string;
  amount: number;
  payoutDetails: string;
  note?: string | null;
}): Promise<CreateWithdrawalResult> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  const payoutDetails = opts.payoutDetails.trim();
  if (!payoutDetails) return { ok: false, reason: "missing_details" };
  const note = opts.note?.trim() || null;

  const db = getDb();
  return db.transaction(async (tx) => {
    // Serialize concurrent withdrawal requests for this user.
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, opts.userId))
      .for("update");

    const [earnedRow] = await tx
      .select({ earned: SUM_DELTA })
      .from(ledger)
      .where(and(eq(ledger.userId, opts.userId), eq(ledger.kind, "income")));
    const [balanceRow] = await tx
      .select({ balance: SUM_DELTA })
      .from(ledger)
      .where(eq(ledger.userId, opts.userId));
    const [reservedRow] = await tx
      .select({
        reserved: sql<number>`cast(coalesce(sum(${withdrawals.amount}), 0) as int)`,
      })
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.userId, opts.userId),
          inArray(withdrawals.status, [...RESERVED_STATUSES]),
        ),
      );

    const earned = earnedRow?.earned ?? 0;
    const balance = balanceRow?.balance ?? 0;
    const reserved = reservedRow?.reserved ?? 0;
    const available = Math.max(0, Math.min(balance, earned - reserved));

    if (opts.amount > available) {
      return { ok: false, reason: "exceeds_available", available };
    }

    const [withdrawal] = await tx
      .insert(withdrawals)
      .values({ userId: opts.userId, amount: opts.amount, payoutDetails, note })
      .returning();

    await tx.insert(ledger).values({
      userId: opts.userId,
      providerId: null,
      delta: -opts.amount,
      kind: "withdrawal",
      reason: "Withdrawal requested",
      ref: `withdrawal:${withdrawal.id}`,
    });

    return { ok: true, withdrawal, available: available - opts.amount };
  });
}

export type ProcessResult =
  | { ok: true; withdrawal: Withdrawal }
  | { ok: false; reason: "not_found" | "not_pending" };

/**
 * Refund a pending withdrawal's escrow and move it to a terminal status. Shared
 * by admin rejection and developer cancellation. The row is locked and must be
 * pending; the `:refund` ref makes the credit idempotent.
 */
async function refundPending(opts: {
  id: string;
  status: "rejected" | "cancelled";
  reason: string;
  adminNote?: string | null;
  processedByUserId?: string | null;
  /** When set, the row's userId must match (developer self-cancel guard). */
  requireUserId?: string;
}): Promise<ProcessResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, opts.id))
      .limit(1)
      .for("update");
    if (!w || (opts.requireUserId && w.userId !== opts.requireUserId)) {
      return { ok: false, reason: "not_found" };
    }
    if (w.status !== "pending") return { ok: false, reason: "not_pending" };

    const [updated] = await tx
      .update(withdrawals)
      .set({
        status: opts.status,
        adminNote: opts.adminNote ?? null,
        processedByUserId: opts.processedByUserId ?? null,
        processedAt: new Date(),
      })
      .where(eq(withdrawals.id, opts.id))
      .returning();

    await tx.insert(ledger).values({
      userId: w.userId,
      providerId: null,
      delta: w.amount,
      kind: "withdrawal_refund",
      reason: opts.reason,
      ref: `withdrawal:${w.id}:refund`,
    });

    return { ok: true, withdrawal: updated };
  });
}

/** Mark a pending withdrawal as paid (admin paid it off-platform). No refund. */
export async function markWithdrawalPaid(opts: {
  id: string;
  adminId: string;
  adminNote?: string | null;
}): Promise<ProcessResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, opts.id))
      .limit(1)
      .for("update");
    if (!w) return { ok: false, reason: "not_found" };
    if (w.status !== "pending") return { ok: false, reason: "not_pending" };

    const [updated] = await tx
      .update(withdrawals)
      .set({
        status: "paid",
        adminNote: opts.adminNote?.trim() || null,
        processedByUserId: opts.adminId,
        processedAt: new Date(),
      })
      .where(eq(withdrawals.id, opts.id))
      .returning();
    return { ok: true, withdrawal: updated };
  });
}

/** Reject a pending withdrawal (admin), refunding the escrowed credits. */
export async function rejectWithdrawal(opts: {
  id: string;
  adminId: string;
  adminNote?: string | null;
}): Promise<ProcessResult> {
  return refundPending({
    id: opts.id,
    status: "rejected",
    reason: "Withdrawal rejected",
    adminNote: opts.adminNote?.trim() || null,
    processedByUserId: opts.adminId,
  });
}

/** Cancel a pending withdrawal (the developer), refunding the escrowed credits. */
export async function cancelWithdrawal(opts: {
  id: string;
  userId: string;
}): Promise<ProcessResult> {
  return refundPending({
    id: opts.id,
    status: "cancelled",
    reason: "Withdrawal cancelled",
    requireUserId: opts.userId,
  });
}

/** A withdrawal a developer made, newest first — for their own dashboard list. */
export async function listUserWithdrawals(
  userId: string,
): Promise<Withdrawal[]> {
  const db = getDb();
  return db
    .select()
    .from(withdrawals)
    .where(eq(withdrawals.userId, userId))
    .orderBy(desc(withdrawals.createdAt));
}

export interface AdminWithdrawalRow {
  id: string;
  userId: string;
  userName: string;
  userDiscordId: string;
  avatar: string | null;
  amount: number;
  payoutDetails: string;
  note: string | null;
  status: string;
  adminNote: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

/**
 * All withdrawal requests for the admin queue: pending first (the ones needing
 * action), then everything else newest-first, with the requester resolved.
 */
export async function listWithdrawals(): Promise<AdminWithdrawalRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: withdrawals.id,
      userId: withdrawals.userId,
      username: users.username,
      globalName: users.globalName,
      userDiscordId: users.discordId,
      avatar: users.avatar,
      amount: withdrawals.amount,
      payoutDetails: withdrawals.payoutDetails,
      note: withdrawals.note,
      status: withdrawals.status,
      adminNote: withdrawals.adminNote,
      processedAt: withdrawals.processedAt,
      createdAt: withdrawals.createdAt,
    })
    .from(withdrawals)
    .leftJoin(users, eq(users.id, withdrawals.userId))
    .orderBy(
      sql`case when ${withdrawals.status} = 'pending' then 0 else 1 end`,
      desc(withdrawals.createdAt),
    );
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.globalName ?? r.username ?? "Unknown",
    userDiscordId: r.userDiscordId ?? "",
    avatar: r.avatar,
    amount: r.amount,
    payoutDetails: r.payoutDetails,
    note: r.note,
    status: r.status,
    adminNote: r.adminNote,
    processedAt: r.processedAt,
    createdAt: r.createdAt,
  }));
}
