import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, ledger, users, type LedgerEntry } from "@/db/schema";

/**
 * Credit ledger. The ledger is append-only; a balance is always SUM(delta).
 * Charges debit a user (negative delta) and are keyed on a unique `ref` for
 * idempotency. Per-user balance safety under concurrency is enforced by locking
 * the user row (SELECT ... FOR UPDATE) inside the charge transaction.
 */

export async function getBalance(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      balance: sql<number>`cast(coalesce(sum(${ledger.delta}), 0) as int)`,
    })
    .from(ledger)
    .where(eq(ledger.userId, userId));
  return row?.balance ?? 0;
}

/** Add credits (admin manual top-up). Returns the new balance. */
export async function topUp(opts: {
  userId: string;
  amount: number;
  reason?: string;
  ref?: string;
}): Promise<number> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    throw new Error("Top-up amount must be a positive integer.");
  }
  const db = getDb();
  await db.insert(ledger).values({
    userId: opts.userId,
    providerId: null,
    delta: opts.amount,
    reason: opts.reason ?? "Admin top-up",
    ref: opts.ref ?? null,
  });
  return getBalance(opts.userId);
}

export type ChargeResult =
  | { ok: true; balance: number; duplicate: boolean }
  | { ok: false; reason: "insufficient_funds"; balance: number };

/**
 * Charge a user `amount` credits on behalf of a provider. Idempotent on `ref`:
 * replaying the same ref returns the existing charge without double-charging.
 */
export async function charge(opts: {
  userId: string;
  providerId: string | null;
  amount: number;
  ref: string;
  reason?: string;
}): Promise<ChargeResult> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    throw new Error("Charge amount must be a positive integer.");
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    // Serialize concurrent charges for this user.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, opts.userId)).for("update");

    const [existing] = await tx
      .select()
      .from(ledger)
      .where(eq(ledger.ref, opts.ref))
      .limit(1);
    const balanceNow = async () => {
      const [r] = await tx
        .select({ b: sql<number>`cast(coalesce(sum(${ledger.delta}), 0) as int)` })
        .from(ledger)
        .where(eq(ledger.userId, opts.userId));
      return r?.b ?? 0;
    };

    if (existing) {
      return { ok: true, balance: await balanceNow(), duplicate: true };
    }

    const balance = await balanceNow();
    if (balance < opts.amount) {
      return { ok: false, reason: "insufficient_funds", balance };
    }

    await tx.insert(ledger).values({
      userId: opts.userId,
      providerId: opts.providerId,
      delta: -opts.amount,
      reason: opts.reason,
      ref: opts.ref,
    });
    return { ok: true, balance: balance - opts.amount, duplicate: false };
  });
}

/** Recent ledger entries for a user, newest first. */
export async function getLedger(
  userId: string,
  limit = 50,
): Promise<LedgerEntry[]> {
  const db = getDb();
  return db
    .select()
    .from(ledger)
    .where(eq(ledger.userId, userId))
    .orderBy(desc(ledger.createdAt))
    .limit(limit);
}

/** Total credits a provider has earned (sum of its charges). */
export async function getProviderEarnings(providerId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      earned: sql<number>`cast(coalesce(-sum(${ledger.delta}), 0) as int)`,
    })
    .from(ledger)
    .where(and(eq(ledger.providerId, providerId), sql`${ledger.delta} < 0`));
  return row?.earned ?? 0;
}

/** Resolve a client's internal id from its public client_id. */
export async function getClientInternalId(
  clientId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  return row?.id ?? null;
}
