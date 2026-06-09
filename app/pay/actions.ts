"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { buildClientRedirect } from "@/lib/oauth";
import { charge, getClientInternalId } from "@/lib/credits";
import {
  cancelIntent,
  completeIntent,
  getIntent,
  type PaymentIntent,
} from "@/lib/payments";

function backTo(intent: PaymentIntent, status: string): string {
  return buildClientRedirect(intent.redirectUri, {
    intent_id: intent.id,
    ref: intent.ref,
    status,
    state: intent.state ?? undefined,
  });
}

/** Confirm or cancel a payment intent, then return the user to the provider. */
export async function confirmPayment(formData: FormData) {
  const intentId = formData.get("intent_id")?.toString();
  const approved = formData.get("decision")?.toString() === "approve";
  if (!intentId) redirect("/dashboard");

  const intent = await getIntent(intentId);
  if (!intent) redirect("/dashboard");

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?return=${encodeURIComponent(`/pay?intent=${intentId}`)}`);
  }
  if (!user.allowed) redirect(backTo(intent, "access_denied"));

  if (intent.status !== "pending" || intent.expiresAt < new Date()) {
    redirect(backTo(intent, intent.status === "completed" ? "completed" : "cancelled"));
  }

  if (!approved) {
    await cancelIntent(intent.id);
    redirect(backTo(intent, "cancelled"));
  }

  const providerId = await getClientInternalId(intent.clientId);
  const result = await charge({
    userId: user.id,
    providerId,
    amount: intent.amount,
    ref: `intent:${intent.id}`,
    reason: intent.description ?? `Payment to ${intent.clientId}`,
  });

  if (!result.ok) {
    redirect(backTo(intent, "insufficient_funds"));
  }

  await completeIntent(intent.id, user.id);
  redirect(backTo(intent, "completed"));
}
