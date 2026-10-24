import { check, createTestDb, schema, summarize } from "./harness";
import { eq, sql } from "drizzle-orm";
import { getBalance, topUp, transfer } from "../lib/credits";
import { createRedeemCode, redeemCode } from "../lib/redeem";
import { getOrCreateDepositAddress } from "../lib/topups";
import { MIGRATED_USER_COLUMNS, migrateAccount } from "../lib/migrate-account";

/** Verification of admin account migration (rename + merge) against PGlite. */
async function main() {
  const db = await createTestDb();

  // --- Coverage: every FK onto users is handled by the migration ---
  const fks = (await db.execute(sql`
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'users'::regclass`)) as unknown as {
    rows: { tbl: string; col: string }[];
  };
  const missing = fks.rows
    .map((r) => `${r.tbl.replace(/"/g, "")}.${r.col}`)
    .filter((name) => !MIGRATED_USER_COLUMNS.includes(name));
  check(
    `every users FK is migrated${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`,
    missing.length === 0 && fks.rows.length > 0,
  );

  const mkUser = async (discordId: string, username: string) =>
    (
      await db
        .insert(schema.users)
        .values({ discordId, username, allowed: true, inGuild: true })
        .returning()
    )[0];

  // --- Rename: new Discord account never signed in ---
  const alice = await mkUser("100", "alice");
  await topUp({ userId: alice.id, amount: 40 });
  await db.insert(schema.sessions).values({
    userId: alice.id,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const renamed = await migrateAccount({ fromDiscordId: "100", toDiscordId: " 101 " });
  check("rename succeeds without merging", renamed.ok && !renamed.merged && renamed.userId === alice.id);
  const [aliceNow] = await db.select().from(schema.users).where(eq(schema.users.id, alice.id));
  check("row takes the new Discord ID", aliceNow?.discordId === "101");
  check("balance is untouched by a rename", (await getBalance(alice.id)) === 40);
  check(
    "old account's sessions are revoked",
    (await db.select().from(schema.sessions).where(eq(schema.sessions.userId, alice.id))).length === 0,
  );

  // --- Input validation ---
  const same = await migrateAccount({ fromDiscordId: "101", toDiscordId: "101" });
  check("same account is rejected", !same.ok && same.reason === "same_account");
  const unknown = await migrateAccount({ fromDiscordId: "999", toDiscordId: "998" });
  check("unknown source is rejected", !unknown.ok && unknown.reason === "source_not_found");
  const blank = await migrateAccount({ fromDiscordId: " ", toDiscordId: "998" });
  check("blank input is rejected", !blank.ok && blank.reason === "invalid_input");

  // --- Merge: new Discord account already has its own row ---
  const oldAcct = await mkUser("200", "bob-old");
  const newAcct = await mkUser("201", "bob-new");
  const carol = await mkUser("300", "carol");

  await topUp({ userId: oldAcct.id, amount: 100 });
  await topUp({ userId: newAcct.id, amount: 30 });
  await transfer({ fromUserId: newAcct.id, toUserId: carol.id, amount: 5 });

  const [app] = await db
    .insert(schema.clients)
    .values({ name: "app", clientId: "fgc_app", clientSecretHash: "x", ownerUserId: newAcct.id })
    .returning();

  // Both redeemed the same code; only the new account redeemed the second.
  const shared = await createRedeemCode({ amount: 10 });
  const onlyNew = await createRedeemCode({ amount: 7 });
  await redeemCode({ userId: oldAcct.id, code: shared.code });
  await redeemCode({ userId: newAcct.id, code: shared.code });
  await redeemCode({ userId: newAcct.id, code: onlyNew.code });

  // Both accounts have a deposit address.
  await db.insert(schema.cryptoDepositAddresses).values([
    { userId: oldAcct.id, derivationIndex: 5, address: "0xold" },
    { userId: newAcct.id, derivationIndex: 6, address: "0xnew" },
  ]);

  // App data: "k" conflicts (new account's value is newer), "o"/"n" are unique.
  const earlier = new Date(Date.now() - 60_000);
  await db.insert(schema.appData).values([
    { clientId: app.id, userId: oldAcct.id, key: "k", value: "old", updatedAt: earlier },
    { clientId: app.id, userId: newAcct.id, key: "k", value: "new" },
    { clientId: app.id, userId: oldAcct.id, key: "o", value: 1 },
    { clientId: app.id, userId: newAcct.id, key: "n", value: 2 },
  ]);

  await db.insert(schema.sessions).values({
    userId: oldAcct.id,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const [newSession] = await db
    .insert(schema.sessions)
    .values({ userId: newAcct.id, expiresAt: new Date(Date.now() + 60_000) })
    .returning();

  const oldBalance = await getBalance(oldAcct.id);
  const newBalance = await getBalance(newAcct.id);
  const merged = await migrateAccount({ fromDiscordId: "200", toDiscordId: "201" });
  check("merge succeeds and keeps the old user id", merged.ok && merged.merged && merged.userId === oldAcct.id);

  const [bob] = await db.select().from(schema.users).where(eq(schema.users.id, oldAcct.id));
  check("merged row adopts the new Discord identity", bob?.discordId === "201" && bob.username === "bob-new");
  check(
    "new account's row is deleted",
    (await db.select().from(schema.users).where(eq(schema.users.id, newAcct.id))).length === 0,
  );
  check("balances are summed", (await getBalance(oldAcct.id)) === oldBalance + newBalance);
  check("counterparty's balance is unaffected", (await getBalance(carol.id)) === 5);
  const [carolIn] = await db.select().from(schema.ledger).where(eq(schema.ledger.userId, carol.id));
  check("ledger counterparty is re-pointed", carolIn?.counterpartyUserId === oldAcct.id);

  const [appNow] = await db.select().from(schema.clients).where(eq(schema.clients.id, app.id));
  check("owned apps move to the merged account", appNow?.ownerUserId === oldAcct.id);

  const reds = await db.select().from(schema.redemptions).where(eq(schema.redemptions.userId, oldAcct.id));
  check(
    "redemptions merge with duplicates collapsed",
    reds.length === 2 && new Set(reds.map((r) => r.codeId)).size === 2,
  );
  const again = await redeemCode({ userId: oldAcct.id, code: onlyNew.code });
  check("merged account can't re-redeem the new account's codes", !again.ok);

  const addrs = await db
    .select()
    .from(schema.cryptoDepositAddresses)
    .where(eq(schema.cryptoDepositAddresses.userId, oldAcct.id));
  check("both deposit addresses are kept", addrs.length === 2);
  check("primary deposit address is the lowest index", (await getOrCreateDepositAddress(oldAcct.id)) === "0xold");

  const data = await db.select().from(schema.appData).where(eq(schema.appData.userId, oldAcct.id));
  const byKey = Object.fromEntries(data.map((d) => [d.key, d.value]));
  check("conflicting app data keeps the newer value", byKey.k === "new");
  check("non-conflicting app data from both accounts survives", byKey.o === 1 && byKey.n === 2 && data.length === 3);

  const sess = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, oldAcct.id));
  check("only the new account's session survives", sess.length === 1 && sess[0].id === newSession.id);

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
