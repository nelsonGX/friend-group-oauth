// Top-ups read config from the environment; set it before the libs use it.
// XPUB is the BIP44 account node m/44'/60'/0' of the fixed test seed
// 000102…1f, so derived addresses are deterministic.
process.env.USDT_HD_XPUB =
  "xpub6DMFE9j2ncmpqUwtaiyPPdiYWRud5iDLhE1ka9gFJKockpH9xeXNKrXRM1XrPsh9NonaRW6hbZ83sukTc2544gvTTTRbp1ak823LG5gBYV5";
process.env.TOPUP_POLL_SECRET = "test-secret";

import { check, createTestDb, schema, summarize } from "./harness";
import { and, eq } from "drizzle-orm";
import { getBalance, getLedger } from "../lib/credits";
import { deriveDepositAddress, toChecksumAddress } from "../lib/hdwallet";
import {
  getOrCreateDepositAddress,
  listUserDeposits,
  microsToCredits,
  microsToUsdtString,
  settleDeposit,
  MICROS_PER_CREDIT,
} from "../lib/topups";

const ADDR0 = "0x919538116b4f25f1ce01429fd9ed7964556bf565";
const ADDR1 = "0xf23692a9de556ee1711b172bf744c5f33b13dc89";

/** Verification of crypto (USDT) top-ups against PGlite (no network). */
async function main() {
  const db = await createTestDb();

  const [alice] = await db
    .insert(schema.users)
    .values({ discordId: "1", username: "alice", allowed: true, inGuild: true })
    .returning();
  const [bob] = await db
    .insert(schema.users)
    .values({ discordId: "2", username: "bob", allowed: true, inGuild: true })
    .returning();

  // --- conversions (exact, no float drift) ---
  check("micros → '1' for 1 USDT", microsToUsdtString(1_000_000) === "1");
  check("micros → '0.03125' for 1 credit", microsToUsdtString(MICROS_PER_CREDIT) === "0.03125");
  check("1 USDT = 32 credits", microsToCredits(1_000_000) === 32);
  check("floors sub-credit dust", microsToCredits(2_000_001) === 64 && microsToCredits(10_000) === 0);

  // --- HD derivation matches the known vector + EIP-55 checksum ---
  check("derives address #0 from xpub", deriveDepositAddress(0) === ADDR0);
  check("derives address #1 from xpub", deriveDepositAddress(1) === ADDR1);
  check(
    "EIP-55 checksum is mixed-case of the same address",
    toChecksumAddress(ADDR0).toLowerCase() === ADDR0 && /[A-F]/.test(toChecksumAddress(ADDR0)),
  );

  // --- per-user address assignment ---
  const a1 = await getOrCreateDepositAddress(alice.id);
  const a2 = await getOrCreateDepositAddress(alice.id);
  const bAddr = await getOrCreateDepositAddress(bob.id);
  check("alice gets index-0 address", a1 === ADDR0);
  check("address is stable for a user", a1 === a2);
  check("bob gets a distinct (index-1) address", bAddr === ADDR1 && bAddr !== a1);

  // --- settle: confirmations gate ---
  const unconfirmed = await settleDeposit({
    chainId: 1,
    toAddress: a1,
    token: "USDT",
    txHash: "0xAAA",
    fromAddress: "0xsender",
    valueMicros: 1_000_000,
    blockNumber: 100,
    confirmations: 3, // below Ethereum's 12
  });
  check("unconfirmed transfer is not credited", !unconfirmed.ok && unconfirmed.reason === "unconfirmed");
  check("balance unchanged while unconfirmed", (await getBalance(alice.id)) === 0);

  // --- settle: below one credit ---
  const dust = await settleDeposit({
    chainId: 1,
    toAddress: a1,
    token: "USDC",
    txHash: "0xDUST",
    fromAddress: "0xsender",
    valueMicros: 10_000, // 0.01 USDT → 0 credits
    blockNumber: 101,
    confirmations: 20,
  });
  check("sub-credit dust is not credited", !dust.ok && dust.reason === "below_one_credit");

  // --- settle: happy path credits whatever arrives ---
  const ok1 = await settleDeposit({
    chainId: 1,
    toAddress: a1,
    token: "USDT",
    txHash: "0xTX1",
    fromAddress: "0xSender",
    valueMicros: 1_000_000, // 1 USDT
    blockNumber: 200,
    confirmations: 20,
  });
  check("matching transfer credits the owner", ok1.ok && !ok1.duplicate && ok1.credits === 32);
  check("user is credited", (await getBalance(alice.id)) === 32);
  check("settlement writes a `topup` ledger row", (await getLedger(alice.id))[0]?.kind === "topup");

  // --- floor on a non-multiple amount ---
  const ok2 = await settleDeposit({
    chainId: 56,
    toAddress: a1,
    token: "USDC",
    txHash: "0xTX2",
    fromAddress: "0xSender",
    valueMicros: 2_000_001, // 2.000001 USDT → 64 credits (1 micro dust dropped)
    blockNumber: 10,
    confirmations: 20,
  });
  check("credits floor(USDT × 32)", ok2.ok && ok2.credits === 64);
  check("balance reflects both deposits", (await getBalance(alice.id)) === 96);

  // --- idempotency on (chain, txHash) ---
  const replay = await settleDeposit({
    chainId: 1,
    toAddress: a1,
    token: "USDT",
    txHash: "0xTX1",
    fromAddress: "0xSender",
    valueMicros: 1_000_000,
    blockNumber: 200,
    confirmations: 50,
  });
  check("re-seeing a transfer is a duplicate no-op", replay.ok && replay.duplicate);
  check("duplicate doesn't double-credit", (await getBalance(alice.id)) === 96);

  // same tx hash on a *different* chain is a separate deposit
  const otherChain = await settleDeposit({
    chainId: 137,
    toAddress: a1,
    token: "USDC",
    txHash: "0xTX1",
    fromAddress: "0xSender",
    valueMicros: 1_000_000,
    blockNumber: 5,
    confirmations: 60,
  });
  check("same hash on another chain credits separately", otherChain.ok && !otherChain.duplicate);
  check("balance includes the cross-chain deposit", (await getBalance(alice.id)) === 128);

  // --- unknown address is ignored ---
  const stranger = await settleDeposit({
    chainId: 1,
    toAddress: "0x000000000000000000000000000000000000beef",
    token: "USDT",
    txHash: "0xTX9",
    fromAddress: "0xSender",
    valueMicros: 1_000_000,
    blockNumber: 300,
    confirmations: 20,
  });
  check("transfer to an unknown address is ignored", !stranger.ok && stranger.reason === "no_address");

  // --- deposits land on the right user ---
  const toBob = await settleDeposit({
    chainId: 1,
    toAddress: bAddr,
    token: "USDT",
    txHash: "0xBOB1",
    fromAddress: "0xSender",
    valueMicros: 1_000_000,
    blockNumber: 301,
    confirmations: 20,
  });
  check("a deposit credits the address owner", toBob.ok && toBob.credits === 32);
  check("bob is credited, not alice", (await getBalance(bob.id)) === 32 && (await getBalance(alice.id)) === 128);

  // --- history records each settled deposit ---
  const aliceDeposits = await listUserDeposits(alice.id);
  check("alice has 3 recorded deposits", aliceDeposits.length === 3);
  const [crossChain] = await db
    .select()
    .from(schema.cryptoDeposits)
    .where(and(eq(schema.cryptoDeposits.userId, alice.id), eq(schema.cryptoDeposits.chainId, 137)));
  check("deposit row stores credits + value", crossChain.credits === 32 && crossChain.valueMicros === 1_000_000);
  check("deposit row records the token", crossChain.token === "USDC");

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
