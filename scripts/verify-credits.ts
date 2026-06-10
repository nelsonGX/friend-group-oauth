import { check, createTestDb, schema, summarize } from "./harness";
import { eq } from "drizzle-orm";
import {
  charge,
  getBalance,
  getIncome,
  getLedger,
  getProviderEarnings,
  settlePaymentIntent,
  topUp,
  transfer,
} from "../lib/credits";
import { completeIntent, createIntent } from "../lib/payments";
import { buildWebhookRequest, validateWebhookUrl } from "../lib/webhooks";
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
  await topUp({ userId: user.id, amount: 0 })
    .then(() => check("topUp rejects zero amount", false))
    .catch(() => check("topUp rejects zero amount", true));

  const c1 = await charge({ userId: user.id, providerId: client.id, amount: 30, ref: "r1" });
  check("charge debits balance to 70", c1.ok && (await getBalance(user.id)) === 70);
  await charge({ userId: user.id, providerId: client.id, amount: -1, ref: "bad-charge" })
    .then(() => check("charge rejects negative amount", false))
    .catch(() => check("charge rejects negative amount", true));

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
  await db
    .insert(schema.paymentIntents)
    .values({
      clientId: client.clientId,
      amount: 0,
      ref: "bad-db-amount",
      redirectUri: "https://x.example/cb",
      expiresAt: new Date(Date.now() + 1000),
    })
    .then(() => check("database rejects non-positive payment intent amounts", false))
    .catch(() => check("database rejects non-positive payment intent amounts", true));
  await db
    .insert(schema.paymentIntents)
    .values({
      clientId: client.clientId,
      amount: 1,
      ref: "bad-db-status",
      redirectUri: "https://x.example/cb",
      status: "bogus",
      expiresAt: new Date(Date.now() + 1000),
    })
    .then(() => check("database rejects invalid payment intent statuses", false))
    .catch(() => check("database rejects invalid payment intent statuses", true));

  if (intent) {
    const settled = await settlePaymentIntent({ intentId: intent.id, userId: user.id });
    check("intent settles atomically", settled.ok && settled.intent.status === "completed");
    const done = settled.ok ? settled.intent : null;
    const again = await settlePaymentIntent({ intentId: intent.id, userId: user.id });
    check("completed intent cannot re-settle", !again.ok && again.reason === "not_pending");
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

  const expired = await createIntent({
    client,
    amount: 1,
    ref: "expired1",
    redirectUri: "https://x.example/cb",
  });
  if (expired.ok) {
    await db
      .update(schema.paymentIntents)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.paymentIntents.id, expired.intent.id));
    const expiredSettle = await settlePaymentIntent({
      intentId: expired.intent.id,
      userId: user.id,
    });
    check("expired intent cannot settle", !expiredSettle.ok && expiredSettle.reason === "expired");
    check("expired intent left balance unchanged", (await getBalance(user.id)) === 50);
    const expiredComplete = await completeIntent(expired.intent.id, user.id);
    check("completeIntent enforces expiry", expiredComplete === null);
  }

  // --- Developer income: paying an owned app credits the owner ---
  const [dev] = await db
    .insert(schema.users)
    .values({ discordId: "2", username: "dev", allowed: true, inGuild: true })
    .returning();
  const [ownedApp] = await db
    .insert(schema.clients)
    .values({
      name: "Owned",
      clientId: "c2",
      clientSecretHash: hashSecret("s"),
      redirectUris: ["https://y.example/cb"],
      allowedScopes: ["identify"],
      ownerUserId: dev.id,
    })
    .returning();

  // user's balance is 50 here; pay 20 to the dev's app.
  const inc = await charge({
    userId: user.id,
    providerId: ownedApp.id,
    amount: 20,
    ref: "owned1",
    reason: "Pro plan",
  });
  check("payment to owned app debits payer", inc.ok && (await getBalance(user.id)) === 30);
  check("payment to owned app credits the owner", (await getBalance(dev.id)) === 20);

  const incomeRows = await getIncome(dev.id);
  check(
    "income report lists the payment with app + payer",
    incomeRows.length === 1 &&
      incomeRows[0].amount === 20 &&
      incomeRows[0].appName === "Owned" &&
      incomeRows[0].fromName === "u",
  );

  const incDup = await charge({
    userId: user.id,
    providerId: ownedApp.id,
    amount: 20,
    ref: "owned1",
  });
  check(
    "owned-app charge stays idempotent (no double credit)",
    incDup.ok &&
      incDup.duplicate === true &&
      (await getBalance(dev.id)) === 20 &&
      (await getIncome(dev.id)).length === 1,
  );

  check("payer accrues no income rows", (await getIncome(user.id)).length === 0);

  // --- Self-payment is a no-op (no circular credits) ---
  const devBalanceBefore = await getBalance(dev.id); // 20, from the income above
  const devEarnedBefore = await getProviderEarnings(ownedApp.id);
  const devIncomeBefore = (await getIncome(dev.id)).length;
  const self = await charge({
    userId: dev.id,
    providerId: ownedApp.id,
    amount: 10,
    ref: "self1",
    reason: "self",
  });
  check("paying your own app reports success", self.ok);
  check("self-payment leaves balance unchanged", (await getBalance(dev.id)) === devBalanceBefore);
  check(
    "self-payment doesn't inflate earnings",
    (await getProviderEarnings(ownedApp.id)) === devEarnedBefore,
  );
  check(
    "self-payment adds no income row",
    (await getIncome(dev.id)).length === devIncomeBefore,
  );

  // --- Peer transfers ---
  const t1 = await transfer({ fromUserId: dev.id, toUserId: user.id, amount: 5, reason: "thanks" });
  check("transfer debits the sender", t1.ok && (await getBalance(dev.id)) === 15);
  check("transfer credits the recipient", (await getBalance(user.id)) === 35);

  const tSelf = await transfer({ fromUserId: dev.id, toUserId: dev.id, amount: 1 });
  check("self-transfer is rejected", !tSelf.ok && tSelf.reason === "self_transfer");

  const tInvalid = await transfer({ fromUserId: dev.id, toUserId: user.id, amount: 0 });
  check("zero-amount transfer is rejected", !tInvalid.ok && tInvalid.reason === "invalid_amount");

  const tOver = await transfer({ fromUserId: dev.id, toUserId: user.id, amount: 9999 });
  check("transfer beyond balance is rejected", !tOver.ok && tOver.reason === "insufficient_funds");
  check(
    "rejected transfer left balances unchanged",
    (await getBalance(dev.id)) === 15 && (await getBalance(user.id)) === 35,
  );

  const tMissing = await transfer({
    fromUserId: dev.id,
    toUserId: "00000000-0000-0000-0000-000000000000",
    amount: 1,
  });
  check(
    "transfer to unknown recipient is rejected",
    !tMissing.ok && tMissing.reason === "recipient_not_found",
  );

  check(
    "webhook URL blocks localhost",
    !(await validateWebhookUrl("http://localhost:3000/hook")).ok,
  );
  check(
    "webhook URL blocks userinfo credentials",
    !(await validateWebhookUrl("https://user:pass@example.com/hook")).ok,
  );
  check(
    "webhook URL blocks non-http schemes",
    !(await validateWebhookUrl("file:///tmp/hook")).ok,
  );
  check(
    "webhook URL blocks private IPv4",
    !(await validateWebhookUrl("http://192.168.1.10/hook")).ok,
  );

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
