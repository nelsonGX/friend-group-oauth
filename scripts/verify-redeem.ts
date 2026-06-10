import { check, createTestDb, schema, summarize } from "./harness";
import { eq } from "drizzle-orm";
import { getBalance, getLedger } from "../lib/credits";
import { createRedeemCode, redeemCode } from "../lib/redeem";

/** Verification of redeem codes (mint + redeem invariants) against PGlite. */
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

  // --- Happy path ---
  const code = await createRedeemCode({ amount: 50, maxRedemptions: 2 });
  check("created code has a formatted value", /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code.code));
  await createRedeemCode({ amount: 0 })
    .then(() => check("createRedeemCode rejects zero amount", false))
    .catch(() => check("createRedeemCode rejects zero amount", true));
  await createRedeemCode({ amount: 1, maxRedemptions: 0 })
    .then(() => check("createRedeemCode rejects zero max redemptions", false))
    .catch(() => check("createRedeemCode rejects zero max redemptions", true));

  const r1 = await redeemCode({ userId: alice.id, code: code.code });
  check("redeem credits the user", r1.ok && r1.balance === 50 && r1.amount === 50);
  check("redeem writes a `redeem` ledger row", (await getLedger(alice.id))[0]?.kind === "redeem");

  // --- Case/whitespace-insensitive input ---
  const dup = await redeemCode({ userId: alice.id, code: `  ${code.code.toLowerCase()}  ` });
  check(
    "same user can't redeem twice (normalized input)",
    !dup.ok && dup.reason === "already_redeemed",
  );
  check("rejected re-redeem doesn't double-credit", (await getBalance(alice.id)) === 50);

  // --- A second user consumes the last redemption ---
  const r2 = await redeemCode({ userId: bob.id, code: code.code });
  check("a different user can redeem the same code", r2.ok && r2.balance === 50);

  // --- Max redemptions exhausted ---
  const [carol] = await db
    .insert(schema.users)
    .values({ discordId: "3", username: "carol", allowed: true, inGuild: true })
    .returning();
  const exhausted = await redeemCode({ userId: carol.id, code: code.code });
  check("redemption beyond max is rejected", !exhausted.ok && exhausted.reason === "exhausted");
  check("exhausted redeem leaves balance at 0", (await getBalance(carol.id)) === 0);

  // --- Unknown code ---
  const missing = await redeemCode({ userId: alice.id, code: "ZZZZ-ZZZZ" });
  check("unknown code is rejected", !missing.ok && missing.reason === "not_found");
  const blank = await redeemCode({ userId: alice.id, code: "   " });
  check("blank code is rejected as not_found", !blank.ok && blank.reason === "not_found");

  // --- Inactive code ---
  const inactiveCode = await createRedeemCode({ amount: 10 });
  await db
    .update(schema.redeemCodes)
    .set({ active: false })
    .where(eq(schema.redeemCodes.id, inactiveCode.id));
  const inactive = await redeemCode({ userId: alice.id, code: inactiveCode.code });
  check("inactive code is rejected", !inactive.ok && inactive.reason === "inactive");

  // --- Expired code ---
  const expiredCode = await createRedeemCode({ amount: 10 });
  await db
    .update(schema.redeemCodes)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(schema.redeemCodes.id, expiredCode.id));
  const expired = await redeemCode({ userId: bob.id, code: expiredCode.code });
  check("expired code is rejected", !expired.ok && expired.reason === "expired");

  // --- Unlimited + custom code ---
  const custom = await createRedeemCode({ amount: 5, code: "free-credits" });
  check("custom code is normalized to uppercase", custom.code === "FREE-CREDITS");
  await createRedeemCode({ amount: 5, code: "free-credits" })
    .then(() => check("duplicate custom code is rejected", false))
    .catch(() => check("duplicate custom code is rejected", true));
  const c1 = await redeemCode({ userId: alice.id, code: "FREE-CREDITS" });
  const c2 = await redeemCode({ userId: bob.id, code: "free-credits" });
  check("unlimited code redeems for multiple users", c1.ok && c2.ok);
  check("alice balance reflects both redemptions", (await getBalance(alice.id)) === 55);

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
