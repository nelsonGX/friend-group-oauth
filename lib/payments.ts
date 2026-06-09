import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentIntents, type Client } from "@/db/schema";

/**
 * Payment intents back the credit "pay" flow. A provider creates an intent
 * server-side (authenticated) so the amount/description are fixed before the
 * user ever sees them; the user then confirms it in the browser.
 */

const INTENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type PaymentIntent = typeof paymentIntents.$inferSelect;

/**
 * Create (or return the existing) intent for a provider + ref. Returns null if
 * the redirect URI is not registered for the client. Idempotent on (clientId,
 * ref): re-creating with the same ref returns the original intent.
 */
export async function createIntent(opts: {
  client: Client;
  amount: number;
  description?: string;
  ref: string;
  redirectUri: string;
  state?: string;
}): Promise<PaymentIntent | null> {
  if (!Number.isInteger(opts.amount) || opts.amount <= 0) return null;
  if (!opts.client.redirectUris.includes(opts.redirectUri)) return null;

  const db = getDb();
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
  if (existing) return existing;

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
    .returning();
  return intent;
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
    .where(and(eq(paymentIntents.id, id), eq(paymentIntents.status, "pending")))
    .returning();
  return intent ?? null;
}

export async function cancelIntent(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(paymentIntents)
    .set({ status: "cancelled" })
    .where(and(eq(paymentIntents.id, id), eq(paymentIntents.status, "pending")));
}
