import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appLedger,
  clients,
  ledger,
  users,
  type AppLedgerEntry,
  type Client,
} from "@/db/schema";

const SUM_APP_DELTA = sql<number>`cast(coalesce(sum(${appLedger.delta}), 0) as int)`;

export type IncomeDestination = "owner" | "app_balance";

export interface AppBalanceSummary {
  balance: number;
  incomeDestination: IncomeDestination;
}

export async function getAppBalance(clientId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ balance: SUM_APP_DELTA })
    .from(appLedger)
    .where(eq(appLedger.clientId, clientId));
  return row?.balance ?? 0;
}

export async function getAppBalanceSummary(
  clientId: string,
): Promise<AppBalanceSummary> {
  const db = getDb();
  const [[client], [balanceRow]] = await Promise.all([
    db
      .select({ incomeDestination: clients.incomeDestination })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1),
    db
      .select({ balance: SUM_APP_DELTA })
      .from(appLedger)
      .where(eq(appLedger.clientId, clientId)),
  ]);
  return {
    balance: balanceRow?.balance ?? 0,
    incomeDestination:
      client?.incomeDestination === "app_balance" ? "app_balance" : "owner",
  };
}

export type AdjustAppBalanceResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "invalid_amount" }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "insufficient_funds"; balance: number };

/** Manual owner/admin app-balance adjustment. Positive values fund the app. */
export async function adjustAppBalance(opts: {
  clientId: string;
  delta: number;
  reason?: string;
  ref?: string;
}): Promise<AdjustAppBalanceResult> {
  if (!Number.isInteger(opts.delta) || opts.delta === 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, opts.clientId))
      .limit(1)
      .for("update");
    if (!client) return { ok: false, reason: "not_found" };

    const [row] = await tx
      .select({ balance: SUM_APP_DELTA })
      .from(appLedger)
      .where(eq(appLedger.clientId, opts.clientId));
    const balance = row?.balance ?? 0;
    const nextBalance = balance + opts.delta;
    if (nextBalance < 0) {
      return { ok: false, reason: "insufficient_funds", balance };
    }

    await tx.insert(appLedger).values({
      clientId: opts.clientId,
      delta: opts.delta,
      kind: opts.delta > 0 ? "manual_fund" : "adjustment",
      reason:
        opts.reason ??
        (opts.delta > 0 ? "Manual app funding" : "Manual app adjustment"),
      ref: opts.ref ?? null,
    });
    return { ok: true, balance: nextBalance };
  });
}

export type FundAppResult =
  | { ok: true; appBalance: number; userBalance: number }
  | { ok: false; reason: "invalid_amount" }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "insufficient_funds"; balance: number };

/** Move credits from a developer/admin user balance into an app balance. */
export async function fundAppFromUserBalance(opts: {
  clientId: string;
  userId: string;
  amount: number;
  reason?: string;
}): Promise<FundAppResult> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, opts.clientId))
      .limit(1)
      .for("update");
    if (!client) return { ok: false, reason: "not_found" };

    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1)
      .for("update");
    if (!user) return { ok: false, reason: "not_found" };

    const [[userRow], [appRow]] = await Promise.all([
      tx
        .select({ balance: sql<number>`cast(coalesce(sum(${ledger.delta}), 0) as int)` })
        .from(ledger)
        .where(eq(ledger.userId, opts.userId)),
      tx
        .select({ balance: SUM_APP_DELTA })
        .from(appLedger)
        .where(eq(appLedger.clientId, opts.clientId)),
    ]);

    const userBalance = userRow?.balance ?? 0;
    if (userBalance < opts.amount) {
      return { ok: false, reason: "insufficient_funds", balance: userBalance };
    }

    const appBalance = appRow?.balance ?? 0;
    const ref = `app-fund:${randomUUID()}`;
    const reason = opts.reason ?? "App balance funding";
    await tx.insert(ledger).values({
      userId: opts.userId,
      providerId: opts.clientId,
      delta: -opts.amount,
      kind: "app_fund",
      reason,
      ref: `${ref}:out`,
    });
    await tx.insert(appLedger).values({
      clientId: opts.clientId,
      userId: opts.userId,
      delta: opts.amount,
      kind: "manual_fund",
      reason,
      ref: `${ref}:in`,
    });

    return {
      ok: true,
      appBalance: appBalance + opts.amount,
      userBalance: userBalance - opts.amount,
    };
  });
}

export async function setIncomeDestination(opts: {
  clientId: string;
  destination: IncomeDestination;
}): Promise<Client | null> {
  const db = getDb();
  const [updated] = await db
    .update(clients)
    .set({ incomeDestination: opts.destination })
    .where(eq(clients.id, opts.clientId))
    .returning();
  return updated ?? null;
}

export type ReversePayoutResult =
  | { ok: true; balance: number; duplicate: boolean; payoutId: string | null }
  | { ok: false; reason: "invalid_amount" }
  | { ok: false; reason: "recipient_not_found" }
  | { ok: false; reason: "insufficient_funds"; balance: number };

/**
 * Pay credits from an app balance to a user. Idempotent on `ref`.
 *
 * Double-entry across ledgers: app_ledger gets the funding debit, and the user
 * ledger gets an `app_payout` credit. Recipient credits are normal spendable
 * credits but are not developer `income`, so they cannot be withdrawn.
 */
export async function reversePayout(opts: {
  clientId: string;
  userId: string;
  amount: number;
  ref: string;
  reason?: string;
}): Promise<ReversePayoutResult> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.id, opts.clientId))
      .limit(1)
      .for("update");

    const [recipient] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);
    if (!recipient) return { ok: false, reason: "recipient_not_found" };

    const appRef = `app-payout:${opts.clientId}:${opts.ref}:out`;
    const userRef = `app-payout:${opts.clientId}:${opts.ref}:in`;
    const [existing] = await tx
      .select({ id: appLedger.id })
      .from(appLedger)
      .where(eq(appLedger.ref, appRef))
      .limit(1);

    const balanceNow = async () => {
      const [row] = await tx
        .select({ balance: SUM_APP_DELTA })
        .from(appLedger)
        .where(eq(appLedger.clientId, opts.clientId));
      return row?.balance ?? 0;
    };

    if (existing) {
      return {
        ok: true,
        balance: await balanceNow(),
        duplicate: true,
        payoutId: existing.id,
      };
    }

    const balance = await balanceNow();
    if (balance < opts.amount) {
      return { ok: false, reason: "insufficient_funds", balance };
    }

    const reason = opts.reason ?? `Payout from ${client?.name ?? "app"}`;
    const [payout] = await tx
      .insert(appLedger)
      .values({
        clientId: opts.clientId,
        userId: opts.userId,
        delta: -opts.amount,
        kind: "reverse_payout",
        reason,
        ref: appRef,
      })
      .returning({ id: appLedger.id });

    await tx.insert(ledger).values({
      userId: opts.userId,
      providerId: opts.clientId,
      delta: opts.amount,
      kind: "app_payout",
      reason,
      ref: userRef,
    });

    return {
      ok: true,
      balance: balance - opts.amount,
      duplicate: false,
      payoutId: payout?.id ?? null,
    };
  });
}

export async function getAppLedger(
  clientId: string,
  limit = 50,
): Promise<AppLedgerEntry[]> {
  const db = getDb();
  return db
    .select()
    .from(appLedger)
    .where(eq(appLedger.clientId, clientId))
    .orderBy(desc(appLedger.createdAt))
    .limit(limit);
}

export async function routeIncomeToAppBalance(opts: {
  clientId: string;
  userId: string;
  amount: number;
  ref: string;
  reason?: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(appLedger).values({
    clientId: opts.clientId,
    userId: opts.userId,
    delta: opts.amount,
    kind: "routed_income",
    reason: opts.reason,
    ref: `${opts.ref}:app`,
  });
}
