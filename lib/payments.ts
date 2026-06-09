import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentIntents, type Client } from "@/db/schema";

/**
 * Payment intents back the credit "pay" flow. A provider creates an intent
 * server-side (authenticated) so the amount/description are fixed before the
 * user ever sees them; the user then confirms it in the browser.
 */

const INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type PaymentIntent = typeof paymentIntents.$inferSelect;

export type CreateIntentResult =
  | { ok: true; intent: PaymentIntent }
  // amount must be a positive integer.
  | { ok: false; error: "invalid_amount" }
  // redirect_uri is not registered for the client.
  | { ok: false; error: "invalid_redirect_uri" }
  // (client, ref) already exists with a different amount/description.
  | { ok: false; error: "conflict" };

/**
 * Create (or return the existing) intent for a provider + ref.
 *
 * Idempotent on (clientId, ref): re-creating with the same ref AND the same
 * amount/description returns the original intent. Re-using a ref with a
 * different amount/description is a `conflict` (the client has a bug) rather
 * than silently honoring either value.
 */
export async function createIntent(opts: {
  client: Client;
  amount: number;
  description?: string;
  ref: string;
  redirectUri: string;
  state?: string;
}): Promise<CreateIntentResult> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!opts.client.redirectUris.includes(opts.redirectUri)) {
    return { ok: false, error: "invalid_redirect_uri" };
  }

  const db = getDb();
  const [intent] = await db
    .insert(paymentIntents)
    .values({
      clientId: opts.client.clientId,
      amount: opts.amount,
      description: opts.description,
      ref: opts.ref,
      redirectUri: opts.redirectUri,
      state: opts.state,
      expiresAt: new Date(Date.now() + INTENT_TTL_MS),
    })
    .onConflictDoNothing({
      target: [paymentIntents.clientId, paymentIntents.ref],
    })
    .returning();
  if (intent) return { ok: true, intent };

  const [existing] = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.clientId, opts.client.clientId),
        eq(paymentIntents.ref, opts.ref),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false, error: "conflict" };

  const sameTerms =
    existing.amount === opts.amount &&
    (existing.description ?? null) === (opts.description ?? null);
  return sameTerms
    ? { ok: true, intent: existing }
    : { ok: false, error: "conflict" };
}

export async function getIntent(id: string): Promise<PaymentIntent | null> {
  const db = getDb();
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.id, id))
    .limit(1);
  return intent ?? null;
}

/** Mark an intent completed for a user — only if still pending. */
export async function completeIntent(
  id: string,
  userId: string,
): Promise<PaymentIntent | null> {
  const db = getDb();
  const [intent] = await db
    .update(paymentIntents)
    .set({ status: "completed", userId })
    .where(
      and(
        eq(paymentIntents.id, id),
        eq(paymentIntents.status, "pending"),
        gt(paymentIntents.expiresAt, new Date()),
      ),
    )
    .returning();
  return intent ?? null;
}

export async function cancelIntent(id: string): Promise<PaymentIntent | null> {
  const db = getDb();
  const [intent] = await db
    .update(paymentIntents)
    .set({ status: "cancelled" })
    .where(and(eq(paymentIntents.id, id), eq(paymentIntents.status, "pending")))
    .returning();
  return intent ?? null;
}
