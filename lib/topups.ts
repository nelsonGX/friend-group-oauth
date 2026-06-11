import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  cryptoDepositAddresses,
  cryptoDeposits,
  cryptoScanState,
  ledger,
  users,
  type CryptoDeposit,
} from "@/db/schema";
import { env } from "@/lib/env";
import { ALL_CHAIN_IDS, CHAINS, getChain, USDT_DECIMALS, type Chain } from "@/lib/chains";
import { deriveDepositAddress, toChecksumAddress } from "@/lib/hdwallet";
import { getTip, getTransfersTo } from "@/lib/evm";

/**
 * Crypto (USDT) top-ups via personal deposit addresses.
 *
 * Each member is assigned one watch-only deposit address (derived from
 * `USDT_HD_XPUB`; see {@link lib/hdwallet}). They send USDT to it on any
 * supported EVM chain — the same address works everywhere — and a poller credits
 * whatever arrives at the fixed rate 1 USDT = 32 credits (1 USD = 32 TWD,
 * 1 credit = 1 TWD), flooring sub-credit dust.
 *
 * USDT is tracked internally as 6-decimal "micros" (1 USDT = 1_000_000 micros),
 * which divides 32 evenly: {@link MICROS_PER_CREDIT} micros per credit. Each
 * settled transfer writes one `topup` ledger credit keyed on
 * `topup:<chainId>:<txHash>` and a `crypto_deposits` row; the unique
 * (chainId, txHash) index makes re-polling idempotent.
 */

/** Credits granted per 1 USDT (the fixed 1 USD = 32 TWD rate, 1 credit = 1 TWD). */
export const CREDITS_PER_USDT = 32;
/** Exact micro-USDT per credit: 1_000_000 / 32 = 31250 (no remainder). */
export const MICROS_PER_CREDIT = 10 ** USDT_DECIMALS / CREDITS_PER_USDT;

/** Whole credits a micro-USDT amount buys (sub-credit dust is dropped). */
export function microsToCredits(micros: number): number {
  return Math.floor(micros / MICROS_PER_CREDIT);
}

/** Render a micro-USDT amount as an exact decimal string (no float rounding). */
export function microsToUsdtString(micros: number): string {
  const unit = 10 ** USDT_DECIMALS;
  const whole = Math.floor(micros / unit);
  const frac = String(micros % unit).padStart(USDT_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** The chains a member can deposit on (currently the full supported set). */
export function enabledChains(): Chain[] {
  return ALL_CHAIN_IDS.map((id) => CHAINS[id]);
}

export interface TopupConfig {
  enabled: boolean;
  creditsPerUsdt: number;
  chains: Chain[];
}

/** What the UI needs to render the top-up page (and whether to show it at all). */
export function getTopupConfig(): TopupConfig {
  return {
    enabled: env.TOPUPS_ENABLED,
    creditsPerUsdt: CREDITS_PER_USDT,
    chains: enabledChains(),
  };
}

/**
 * The member's deposit address, creating (deriving + storing) it on first use.
 * Idempotent: the unique `userId` row means repeat calls return the same address.
 * A fresh index is assigned as max(index)+1 under a retry on the unique index, so
 * concurrent first-time creations can't collide on an index.
 */
export async function getOrCreateDepositAddress(userId: string): Promise<string> {
  const db = getDb();

  const [existing] = await db
    .select({ address: cryptoDepositAddresses.address })
    .from(cryptoDepositAddresses)
    .where(eq(cryptoDepositAddresses.userId, userId))
    .limit(1);
  if (existing) return existing.address;

  for (let attempt = 0; attempt < 8; attempt++) {
    const [{ next }] = await db
      .select({
        next: sql<number>`cast(coalesce(max(${cryptoDepositAddresses.derivationIndex}), -1) + 1 as int)`,
      })
      .from(cryptoDepositAddresses);
    const address = deriveDepositAddress(next).toLowerCase();
    try {
      await db
        .insert(cryptoDepositAddresses)
        .values({ userId, derivationIndex: next, address });
      return address;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Either this user got an address concurrently, or the index was taken.
      const [now] = await db
        .select({ address: cryptoDepositAddresses.address })
        .from(cryptoDepositAddresses)
        .where(eq(cryptoDepositAddresses.userId, userId))
        .limit(1);
      if (now) return now.address;
      // Index race — recompute max+1 and retry.
    }
  }
  throw new Error("Could not assign a deposit address.");
}

/** True if a thrown DB error is a Postgres unique-constraint violation (23505). */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505" || causeCode === "23505";
}

export type SettleResult =
  | { ok: true; credits: number; duplicate: boolean }
  | { ok: false; reason: "unconfirmed" | "below_one_credit" | "no_address" };

/**
 * Credit one observed incoming transfer to the address's owner. Pure DB logic
 * (no network), so it's directly testable.
 *
 * Idempotent: a transfer already recorded (same chain + txHash) is a no-op. The
 * owning user is resolved from the destination address, the payer row is locked,
 * and the `topup` ledger credit + `crypto_deposits` record are written together.
 */
export async function settleDeposit(opts: {
  chainId: number;
  toAddress: string;
  token: string;
  txHash: string;
  fromAddress: string | null;
  valueMicros: number;
  blockNumber: number | null;
  confirmations: number;
}): Promise<SettleResult> {
  const chain = getChain(opts.chainId);
  if (!chain) return { ok: false, reason: "no_address" };
  if (opts.confirmations < chain.minConfirmations) {
    return { ok: false, reason: "unconfirmed" };
  }
  const credits = microsToCredits(opts.valueMicros);
  if (credits <= 0) return { ok: false, reason: "below_one_credit" };

  const txHash = opts.txHash.toLowerCase();
  const toAddress = opts.toAddress.toLowerCase();

  const db = getDb();
  return db.transaction(async (tx) => {
    // Which member owns the destination address?
    const [addr] = await tx
      .select({ userId: cryptoDepositAddresses.userId })
      .from(cryptoDepositAddresses)
      .where(eq(cryptoDepositAddresses.address, toAddress))
      .limit(1);
    if (!addr) return { ok: false, reason: "no_address" };

    // Already recorded this transfer? Idempotent no-op.
    const [seen] = await tx
      .select({ credits: cryptoDeposits.credits })
      .from(cryptoDeposits)
      .where(and(eq(cryptoDeposits.chainId, opts.chainId), eq(cryptoDeposits.txHash, txHash)))
      .limit(1);
    if (seen) return { ok: true, credits: seen.credits, duplicate: true };

    // Lock the payee row, mirroring the rest of the ledger's concurrency model.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, addr.userId)).for("update");

    await tx.insert(ledger).values({
      userId: addr.userId,
      providerId: null,
      delta: credits,
      kind: "topup",
      reason: `${opts.token} top-up · ${microsToUsdtString(opts.valueMicros)} ${opts.token} on ${chain.name}`,
      ref: `topup:${opts.chainId}:${txHash}`,
    });

    await tx.insert(cryptoDeposits).values({
      userId: addr.userId,
      chainId: opts.chainId,
      token: opts.token,
      txHash,
      fromAddress: opts.fromAddress?.toLowerCase() ?? null,
      valueMicros: opts.valueMicros,
      credits,
      blockNumber: opts.blockNumber,
    });

    return { ok: true, credits, duplicate: false };
  });
}

export interface PollSummary {
  chainId: number;
  fromBlock: number;
  toBlock: number;
  settled: number;
}

/**
 * Scan one chain for new deposits and credit them. Resumes from the stored
 * cursor (or `tip − initialLookback` on first run), scans up to
 * `tip − minConfirmations` so only confirmed transfers settle, then advances the
 * cursor. Crediting is idempotent, so an overlap or re-run never double-credits.
 */
export async function pollChain(chainId: number): Promise<PollSummary> {
  const chain = getChain(chainId);
  const db = getDb();
  const empty: PollSummary = { chainId, fromBlock: 0, toBlock: 0, settled: 0 };
  if (!chain) return empty;

  const addresses = (
    await db.select({ address: cryptoDepositAddresses.address }).from(cryptoDepositAddresses)
  ).map((r) => r.address);
  if (addresses.length === 0) return empty;

  const tip = await getTip(chainId);
  if (!tip) return empty;
  const safeTip = tip - chain.minConfirmations;
  if (safeTip <= 0) return empty;

  const [state] = await db
    .select({ lastBlock: cryptoScanState.lastBlock })
    .from(cryptoScanState)
    .where(eq(cryptoScanState.chainId, chainId))
    .limit(1);
  const from = state
    ? state.lastBlock + 1
    : Math.max(1, tip - chain.initialLookbackBlocks);
  if (from > safeTip) return { chainId, fromBlock: from, toBlock: safeTip, settled: 0 };

  const transfers = await getTransfersTo(chainId, addresses, from, safeTip);
  let settled = 0;
  for (const t of transfers) {
    const r = await settleDeposit({
      chainId,
      toAddress: t.toAddress,
      token: t.token,
      txHash: t.txHash,
      fromAddress: t.from,
      valueMicros: t.valueMicros,
      blockNumber: t.blockNumber,
      confirmations: tip - t.blockNumber,
    });
    if (r.ok && !r.duplicate) settled++;
  }

  // Advance the cursor only after a clean scan of the window.
  await db
    .insert(cryptoScanState)
    .values({ chainId, lastBlock: safeTip, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: cryptoScanState.chainId,
      set: { lastBlock: safeTip, updatedAt: new Date() },
    });

  return { chainId, fromBlock: from, toBlock: safeTip, settled };
}

/** Scan every supported chain for new deposits. Sequential, friend-group scale. */
export async function pollAllChains(): Promise<PollSummary[]> {
  if (!env.TOPUPS_ENABLED) return [];
  const summaries: PollSummary[] = [];
  for (const chainId of ALL_CHAIN_IDS) {
    try {
      summaries.push(await pollChain(chainId));
    } catch {
      // One flaky RPC shouldn't sink the whole run; cursor just isn't advanced.
      summaries.push({ chainId, fromBlock: 0, toBlock: 0, settled: 0 });
    }
  }
  return summaries;
}

// Global throttle so on-demand refresh (the top-up page) can't hammer the RPCs
// when several members watch their deposits at once. A scan covers all members,
// so this is shared rather than per-user.
let lastRefreshAt = 0;
const ON_DEMAND_MIN_INTERVAL_MS = 8000;

/**
 * Trigger a (throttled) scan on demand while a member watches the top-up page,
 * then return their deposits. The scan covers everyone, so it's shared-throttled.
 */
export async function refreshUserDeposits(userId: string): Promise<CryptoDeposit[]> {
  if (env.TOPUPS_ENABLED) {
    const now = Date.now();
    if (now - lastRefreshAt >= ON_DEMAND_MIN_INTERVAL_MS) {
      lastRefreshAt = now;
      await pollAllChains();
    }
  }
  return listUserDeposits(userId);
}

/** A member's settled deposits, newest first. */
export async function listUserDeposits(
  userId: string,
  limit = 50,
): Promise<CryptoDeposit[]> {
  const db = getDb();
  return db
    .select()
    .from(cryptoDeposits)
    .where(eq(cryptoDeposits.userId, userId))
    .orderBy(desc(cryptoDeposits.createdAt))
    .limit(limit);
}

export { toChecksumAddress };
