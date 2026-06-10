import { check, createTestDb, schema, summarize } from "./harness";
import { eq } from "drizzle-orm";
import {
  deleteData,
  getData,
  listData,
  MAX_KEY_LENGTH,
  resolveScope,
  setData,
  validateKey,
  validateValueSize,
  type DataScope,
} from "../lib/data";
import { hashSecret } from "../lib/crypto";

/** Verification of the hosted JSON data store against PGlite. */
async function main() {
  const db = await createTestDb();

  const [userA] = await db
    .insert(schema.users)
    .values({ discordId: "1", username: "a", allowed: true, inGuild: true })
    .returning();
  const [userB] = await db
    .insert(schema.users)
    .values({ discordId: "2", username: "b", allowed: true, inGuild: true })
    .returning();
  const [app1] = await db
    .insert(schema.clients)
    .values({
      name: "App1",
      clientId: "c1",
      clientSecretHash: hashSecret("s"),
      redirectUris: ["https://x.example/cb"],
    })
    .returning();
  const [app2] = await db
    .insert(schema.clients)
    .values({
      name: "App2",
      clientId: "c2",
      clientSecretHash: hashSecret("s"),
      redirectUris: ["https://y.example/cb"],
    })
    .returning();

  const appScope: DataScope = { clientId: app1.id, userId: null };
  const userAScope: DataScope = { clientId: app1.id, userId: userA.id };
  const userBScope: DataScope = { clientId: app1.id, userId: userB.id };
  const app2Scope: DataScope = { clientId: app2.id, userId: null };

  // --- Round-trip + not-found ---
  check("get of a missing key returns null", (await getData(appScope, "k")) === null);
  await setData(appScope, "k", { hello: "world" });
  const got = await getData(appScope, "k");
  check(
    "set then get round-trips the value",
    got !== null && (got.value as { hello: string }).hello === "world",
  );

  // --- Upsert (last-write-wins) + updatedAt advances ---
  const first = await setData(appScope, "k", { hello: "again" });
  await new Promise((r) => setTimeout(r, 5));
  const second = await setData(appScope, "k", { hello: "final" });
  const afterUpsert = await getData(appScope, "k");
  check(
    "set upserts (overwrites the existing value)",
    afterUpsert !== null &&
      (afterUpsert.value as { hello: string }).hello === "final",
  );
  check(
    "upsert advances updated_at",
    second.updatedAt.getTime() >= first.updatedAt.getTime(),
  );
  const appRows = await db
    .select()
    .from(schema.appData)
    .where(eq(schema.appData.clientId, app1.id));
  check("upsert does not create duplicate rows", appRows.length === 1);

  // --- App-global and per-user are independent slots for the same key ---
  await setData(userAScope, "k", { who: "userA" });
  const appAfterUser = await getData(appScope, "k");
  const userAVal = await getData(userAScope, "k");
  check(
    "per-user write does not touch the app-global slot",
    appAfterUser !== null &&
      (appAfterUser.value as { hello: string }).hello === "final",
  );
  check(
    "per-user slot holds its own value",
    userAVal !== null && (userAVal.value as { who: string }).who === "userA",
  );

  // --- Per-user isolation ---
  check("user B sees nothing under user A's key", (await getData(userBScope, "k")) === null);
  await setData(userBScope, "k", { who: "userB" });
  const stillA = await getData(userAScope, "k");
  check(
    "writing user B's slot leaves user A's intact",
    stillA !== null && (stillA.value as { who: string }).who === "userA",
  );

  // --- App isolation ---
  check("a second app sees nothing at the same key", (await getData(app2Scope, "k")) === null);
  await setData(app2Scope, "k", { app: 2 });
  const app1Val = await getData(appScope, "k");
  check(
    "writing app 2's store leaves app 1's intact",
    app1Val !== null && (app1Val.value as { hello: string }).hello === "final",
  );

  // --- JSON null is storable and distinct from not-found ---
  await setData(appScope, "nullable", null);
  const nullRow = await getData(appScope, "nullable");
  check("JSON null value is found", nullRow !== null && nullRow.value === null);
  check("missing key is still not-found (≠ stored null)", (await getData(appScope, "absent")) === null);

  // --- Delete is idempotent ---
  check("delete returns true when a row is removed", (await deleteData(appScope, "nullable")) === true);
  check("delete returns false when nothing exists", (await deleteData(appScope, "nullable")) === false);
  check("get after delete is not-found", (await getData(appScope, "nullable")) === null);

  // --- List: scope filtering, prefix, pagination ---
  for (const k of ["item:1", "item:2", "item:3", "other:1"]) {
    await setData(appScope, k, { k });
  }
  const all = await listData(appScope, {});
  // app1 app-global currently holds: k, item:1..3, other:1 = 5 keys
  check("list returns all keys in the scope", all.entries.length === 5 && all.nextCursor === null);
  check(
    "list is ordered by key ascending",
    all.entries[0].key === "item:1" && all.entries[1].key === "item:2",
  );
  check(
    "list returns values alongside keys",
    (all.entries[0].value as { k: string }).k === "item:1",
  );

  const prefixed = await listData(appScope, { prefix: "item:" });
  check("list prefix filters to matching keys", prefixed.entries.length === 3);

  const page1 = await listData(appScope, { prefix: "item:", limit: 2 });
  check(
    "list limit caps the page and yields a cursor",
    page1.entries.length === 2 && page1.nextCursor === "item:2",
  );
  const page2 = await listData(appScope, { prefix: "item:", limit: 2, cursor: page1.nextCursor! });
  check(
    "list cursor fetches the next page and then exhausts",
    page2.entries.length === 1 &&
      page2.entries[0].key === "item:3" &&
      page2.nextCursor === null,
  );

  // --- Cascade: deleting a user removes per-user rows, keeps app-global ---
  await db.delete(schema.users).where(eq(schema.users.id, userA.id));
  const afterUserDelete = await db
    .select()
    .from(schema.appData)
    .where(eq(schema.appData.userId, userA.id));
  check("deleting a user cascades their per-user data", afterUserDelete.length === 0);
  check(
    "app-global data survives a user deletion",
    (await getData(appScope, "k")) !== null,
  );

  // --- Cascade: deleting an app removes all its data ---
  await db.delete(schema.clients).where(eq(schema.clients.id, app1.id));
  const afterAppDelete = await db
    .select()
    .from(schema.appData)
    .where(eq(schema.appData.clientId, app1.id));
  check("deleting an app cascades all its data", afterAppDelete.length === 0);

  // --- Validation helpers ---
  check("validateKey rejects empty key", validateKey("") !== null);
  check("validateKey rejects oversized key", validateKey("x".repeat(MAX_KEY_LENGTH + 1)) !== null);
  check("validateKey accepts a normal key", validateKey("ok") === null);
  check(
    "validateValueSize rejects an oversized value",
    validateValueSize({ big: "y".repeat(300_000) }) !== null,
  );
  check("validateValueSize accepts a small value", validateValueSize({ ok: true }) === null);

  // --- Scope resolution ---
  check(
    "resolveScope: app scope yields a null userId",
    (() => {
      const r = resolveScope(app2.id, "app", undefined);
      return r.ok && r.scope.userId === null;
    })(),
  );
  check(
    "resolveScope: app scope rejects a stray user_id",
    !resolveScope(app2.id, "app", userB.id).ok,
  );
  check(
    "resolveScope: user scope requires a UUID user_id",
    !resolveScope(app2.id, "user", "not-a-uuid").ok,
  );
  check(
    "resolveScope: user scope accepts a UUID",
    (() => {
      const r = resolveScope(app2.id, "user", userB.id);
      return r.ok && r.scope.userId === userB.id;
    })(),
  );
  check(
    "resolveScope: unknown scope is rejected",
    !resolveScope(app2.id, "global", undefined).ok,
  );

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
