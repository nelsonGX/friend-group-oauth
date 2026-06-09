import { check, createTestDb, schema, summarize } from "./harness";
import {
  charge,
  getBalance,
  getLedger,
  getProviderEarnings,
  topUp,
} from "../lib/credits";
import { completeIntent, createIntent } from "../lib/payments";
import { buildWebhookRequest } from "../lib/webhooks";
import { hashSecret, hmacVerify } from "../lib/crypto";

/** Verification of the credit ledger + payment intents against PGlite. */
async function main() {
  const db = await createTestDb();

  const [user] = await db
    .insert(schema.users)
    .values({ discordId: "1", username: "u", allowed: true, inGuild: true })
    .returning();
  const [client] = await db
    .insert(schema.clients)
    .values({
      name: "Prov",
      clientId: "c1",
      clientSecretHash: hashSecret("s"),
      redirectUris: ["https://x.example/cb"],
      allowedScopes: ["identify"],
    })
    .returning();

  await topUp({ userId: user.id, amount: 100 });
  check("topUp sets balance to 100", (await getBalance(user.id)) === 100);

  const c1 = await charge({ userId: user.id, providerId: client.id, amount: 30, ref: "r1" });
  check("charge debits balance to 70", c1.ok && (await getBalance(user.id)) === 70);

  const dup = await charge({ userId: user.id, providerId: client.id, amount: 30, ref: "r1" });
  check(
    "duplicate ref does not double-charge",
    dup.ok && dup.duplicate === true && (await getBalance(user.id)) === 70,
  );

  const over = await charge({ userId: user.id, providerId: client.id, amount: 1000, ref: "r2" });
  check("charge beyond balance is rejected", !over.ok && over.reason === "insufficient_funds");
  check("rejected charge left balance unchanged", (await getBalance(user.id)) === 70);

  check("provider earnings reflect charges", (await getProviderEarnings(client.id)) === 30);
  check("ledger history has 2 entries", (await getLedger(user.id)).length === 2);

  const created = await createIntent({
    client,
    amount: 20,
    ref: "pay1",
    redirectUri: "https://x.example/cb",
    description: "thing",
  });
  check("intent created pending", created.ok && created.intent.status === "pending");
  const intent = created.ok ? created.intent : null;

  const sameRef = await createIntent({
    client,
    amount: 20,
    ref: "pay1",
    redirectUri: "https://x.example/cb",
    description: "thing",
  });
  check(
    "same ref + same terms is idempotent",
    sameRef.ok && sameRef.intent.id === intent?.id && sameRef.intent.amount === 20,
  );

  const conflict = await createIntent({
    client,
    amount: 999,
    ref: "pay1",
    redirectUri: "https://x.example/cb",
  });
  check(
    "same ref + different amount is a conflict",
    !conflict.ok && conflict.error === "conflict",
  );

  const badRedirect = await createIntent({ client, amount: 5, ref: "pay2", redirectUri: "https://evil.example/cb" });
  check(
    "intent rejects unregistered redirect_uri",
    !badRedirect.ok && badRedirect.error === "invalid_redirect_uri",
  );

  if (intent) {
    const r = await charge({ userId: user.id, providerId: client.id, amount: intent.amount, ref: `intent:${intent.id}` });
    check("intent charge succeeds", r.ok);
    const done = await completeIntent(intent.id, user.id);
    check("intent completes once", done?.status === "completed");
    const again = await completeIntent(intent.id, user.id);
    check("completed intent cannot re-complete", again === null);
    check("balance after intent is 50", (await getBalance(user.id)) === 50);

    if (done) {
      const { body, headers } = buildWebhookRequest(done, "whsec_test");
      const [t, v1] = headers["x-webhook-signature"]
        .split(",")
        .map((kv) => kv.split("=")[1]);
      check("webhook signature verifies over `t.body`", hmacVerify(`${t}.${body}`, "whsec_test", v1));
      check("webhook id header is the intent id", headers["x-webhook-id"] === done.id);
      check("webhook event reflects status", JSON.parse(body).event === "payment.completed");
    }
  }

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
