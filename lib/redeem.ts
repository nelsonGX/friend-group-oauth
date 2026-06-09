import { randomInt } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ledger, redeemCodes, redemptions, type RedeemCode } from "@/db/schema";

/**
 * Redeem codes: admin-minted coupons a member exchanges for credits.
 *
 * A code grants a fixed `amount`, is redeemable up to `maxRedemptions` times
 * (null = unlimited) but only once per user, and may expire. Redeeming writes a
 * single `redeem` ledger row keyed on the redemption id, so the user's balance is
 * still just SUM(delta). Concurrency is made safe by locking the code row
 * (SELECT ... FOR UPDATE) inside the redeem transaction, with the unique
 * (codeId, userId) index as a backstop against once-per-user races.
 */

/** Unambiguous alphabet — no 0/O/1/I — for human-typable codes. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A formatted `XXXX-XXXX` code drawn from {@link CODE_ALPHABET}. */
export function generateCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** Normalize user-entered codes so case/whitespace don't matter. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Create a redeem code. Auto-generates the code if none is given, retrying a few
 * times on the (astronomically unlikely) chance of a unique collision. Returns
 * the inserted row, whose `code` is the value to hand out.
 */
export async function createRedeemCode(opts: {
  amount: number;
  maxRedemptions?: number | null;
  expiresAt?: Date | null;
  createdByUserId?: string | null;
  code?: string;
}): Promise<RedeemCode> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    throw new Error("Redeem amount must be a positive integer.");
  }
  if (
    opts.maxRedemptions != null &&
    (!Number.isInteger(opts.maxRedemptions) || opts.maxRedemptions <= 0)
  ) {
    throw new Error("Max redemptions must be a positive integer.");
  }
  const db = getDb();
  const values = {
    amount: opts.amount,
    maxRedemptions: opts.maxRedemptions ?? null,
    expiresAt: opts.expiresAt ?? null,
    createdByUserId: opts.createdByUserId ?? null,
  };

  // A caller-supplied code is used as-is (one attempt); a generated one retries.
  const attempts = opts.code ? [normalizeCode(opts.code)] : Array.from({ length: 5 }, generateCode);
  let lastErr: unknown;
  for (const code of attempts) {
    try {
      const [row] = await db
        .insert(redeemCodes)
        .values({ ...values, code })
        .returning();
      return row;
    } catch (err) {
      lastErr = err;
      // Unique violation on `code` → try the next candidate (generated codes only).
    }
  }
  throw lastErr ?? new Error("Could not create a unique redeem code.");
}

export type RedeemResult =
  | { ok: true; amount: number; balance: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "inactive"
        | "expired"
        | "exhausted"
        | "already_redeemed";
    };

/**
 * Redeem a code for the given user. Atomic and limit-safe: the code row is locked
 * for the duration so concurrent redemptions can't exceed `maxRedemptions`, and a
 * user can't redeem the same code twice. Idempotency is structural — a second
 * attempt by the same user is rejected before any ledger write.
 */
export async function redeemCode(opts: {
  userId: string;
  code: string;
}): Promise<RedeemResult> {
  const normalized = normalizeCode(opts.code);
  if (!normalized) return { ok: false, reason: "not_found" };

  const db = getDb();
  return db.transaction(async (tx) => {
    // Lock the code row to serialize concurrent redemptions of the same code.
    const [code] = await tx
      .select()
      .from(redeemCodes)
      .where(eq(redeemCodes.code, normalized))
      .limit(1)
      .for("update");
    if (!code) return { ok: false, reason: "not_found" };
    if (!code.active) return { ok: false, reason: "inactive" };
    if (code.expiresAt && code.expiresAt < new Date()) {
      return { ok: false, reason: "expired" };
    }

    if (code.maxRedemptions != null) {
      const [{ count }] = await tx
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(redemptions)
        .where(eq(redemptions.codeId, code.id));
      if (count >= code.maxRedemptions) {
        return { ok: false, reason: "exhausted" };
      }
    }

    const [already] = await tx
      .select({ id: redemptions.id })
      .from(redemptions)
      .where(
        sql`${redemptions.codeId} = ${code.id} and ${redemptions.userId} = ${opts.userId}`,
      )
      .limit(1);
    if (already) return { ok: false, reason: "already_redeemed" };

    const [redemption] = await tx
      .insert(redemptions)
      .values({ codeId: code.id, userId: opts.userId })
      .returning({ id: redemptions.id });

    await tx.insert(ledger).values({
      userId: opts.userId,
      providerId: null,
      delta: code.amount,
      kind: "redeem",
      reason: `Redeemed code ${code.code}`,
      ref: `redeem:${redemption.id}`,
    });

    const [r] = await tx
      .select({ b: sql<number>`cast(coalesce(sum(${ledger.delta}), 0) as int)` })
      .from(ledger)
      .where(eq(ledger.userId, opts.userId));
    return { ok: true, amount: code.amount, balance: r?.b ?? 0 };
  });
}

export interface RedeemCodeSummary {
  id: string;
  code: string;
  amount: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: Date | null;
  active: boolean;
  createdAt: Date;
}

/** All redeem codes, newest first, with their redemption counts — for the admin table. */
export async function listRedeemCodes(): Promise<RedeemCodeSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: redeemCodes.id,
      code: redeemCodes.code,
      amount: redeemCodes.amount,
      maxRedemptions: redeemCodes.maxRedemptions,
      expiresAt: redeemCodes.expiresAt,
      active: redeemCodes.active,
      createdAt: redeemCodes.createdAt,
      redemptionCount: sql<number>`cast(count(${redemptions.id}) as int)`,
    })
    .from(redeemCodes)
    .leftJoin(redemptions, eq(redemptions.codeId, redeemCodes.id))
    .groupBy(redeemCodes.id)
    .orderBy(desc(redeemCodes.createdAt));
  return rows;
}
