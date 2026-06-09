import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
    kind: "topup",
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
 *
 * Double-entry: when the provider has an owner (and the payer isn't that owner),
 * the same amount is credited to the owner as `income` in the same transaction,
 * so a payment to an app is really a transfer into the developer's balance. Apps
 * with no owner behave as before — the debit is recorded, but nobody is credited.
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

    // Resolve the provider's owner, so the charge can be credited to them.
    let ownerUserId: string | null = null;
    if (opts.providerId) {
      const [client] = await tx
        .select({ ownerUserId: clients.ownerUserId })
        .from(clients)
        .where(eq(clients.id, opts.providerId))
        .limit(1);
      ownerUserId = client?.ownerUserId ?? null;
    }

    await tx.insert(ledger).values({
      userId: opts.userId,
      providerId: opts.providerId,
      counterpartyUserId: ownerUserId,
      delta: -opts.amount,
      kind: "charge",
      reason: opts.reason,
      ref: opts.ref,
    });

    // Credit the developer who owns the app (skip self-payments).
    if (ownerUserId && ownerUserId !== opts.userId) {
      await tx.insert(ledger).values({
        userId: ownerUserId,
        providerId: opts.providerId,
        counterpartyUserId: opts.userId,
        delta: opts.amount,
        kind: "income",
        reason: opts.reason,
        ref: `${opts.ref}:in`,
      });
    }

    return { ok: true, balance: balance - opts.amount, duplicate: false };
  });
}

export type TransferResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "invalid_amount" }
  | { ok: false; reason: "self_transfer" }
  | { ok: false; reason: "recipient_not_found" }
  | { ok: false; reason: "insufficient_funds"; balance: number };

/**
 * Move `amount` credits from one user to another. Atomic and balance-safe: the
 * sender row is locked (SELECT ... FOR UPDATE) so concurrent outgoing transfers
 * can't overdraw. Writes a `transfer_out` debit and a matching `transfer_in`
 * credit, both keyed on a shared transfer id for traceability.
 */
export async function transfer(opts: {
  fromUserId: string;
  toUserId: string;
  amount: number;
  reason?: string;
}): Promise<TransferResult> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (opts.fromUserId === opts.toUserId) {
    return { ok: false, reason: "self_transfer" };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [recipient] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, opts.toUserId))
      .limit(1);
    if (!recipient) {
      return { ok: false, reason: "recipient_not_found" };
    }

    // Serialize concurrent outgoing transfers for the sender.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, opts.fromUserId)).for("update");

    const [r] = await tx
      .select({ b: sql<number>`cast(coalesce(sum(${ledger.delta}), 0) as int)` })
      .from(ledger)
      .where(eq(ledger.userId, opts.fromUserId));
    const balance = r?.b ?? 0;
    if (balance < opts.amount) {
      return { ok: false, reason: "insufficient_funds", balance };
    }

    const transferId = randomUUID();
    await tx.insert(ledger).values([
      {
        userId: opts.fromUserId,
        counterpartyUserId: opts.toUserId,
        delta: -opts.amount,
        kind: "transfer_out",
        reason: opts.reason,
        ref: `transfer:${transferId}:out`,
      },
      {
        userId: opts.toUserId,
        counterpartyUserId: opts.fromUserId,
        delta: opts.amount,
        kind: "transfer_in",
        reason: opts.reason,
        ref: `transfer:${transferId}:in`,
      },
    ]);
    return { ok: true, balance: balance - opts.amount };
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

export interface IncomeEntry {
  id: string;
  amount: number;
  reason: string | null;
  createdAt: Date;
  appName: string | null;
  fromName: string | null;
}

/**
 * A developer's income report: every payment credited to them, newest first,
 * with the paying app and payer resolved for display ("what gives them money").
 */
export async function getIncome(
  userId: string,
  limit = 50,
): Promise<IncomeEntry[]> {
  const db = getDb();
  const payer = alias(users, "payer");
  const rows = await db
    .select({
      id: ledger.id,
      amount: ledger.delta,
      reason: ledger.reason,
      createdAt: ledger.createdAt,
      appName: clients.name,
      payerUsername: payer.username,
      payerGlobalName: payer.globalName,
    })
    .from(ledger)
    .leftJoin(clients, eq(clients.id, ledger.providerId))
    .leftJoin(payer, eq(payer.id, ledger.counterpartyUserId))
    .where(and(eq(ledger.userId, userId), eq(ledger.kind, "income")))
    .orderBy(desc(ledger.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    createdAt: r.createdAt,
    appName: r.appName,
    fromName: r.payerGlobalName ?? r.payerUsername ?? null,
  }));
}

export interface ActivityEntry extends LedgerEntry {
  appName: string | null;
  counterpartyName: string | null;
}

/**
 * A user's wallet feed: recent ledger rows enriched with the counterparty's
 * display name and the app name, so transfers and payments can be labelled.
 */
export async function getActivity(
  userId: string,
  limit = 50,
): Promise<ActivityEntry[]> {
  const db = getDb();
  const counterparty = alias(users, "counterparty");
  const rows = await db
    .select({
      entry: ledger,
      appName: clients.name,
      counterpartyUsername: counterparty.username,
      counterpartyGlobalName: counterparty.globalName,
    })
    .from(ledger)
    .leftJoin(clients, eq(clients.id, ledger.providerId))
    .leftJoin(counterparty, eq(counterparty.id, ledger.counterpartyUserId))
    .where(eq(ledger.userId, userId))
    .orderBy(desc(ledger.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.entry,
    appName: r.appName,
    counterpartyName: r.counterpartyGlobalName ?? r.counterpartyUsername ?? null,
  }));
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
