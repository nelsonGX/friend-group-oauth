"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { buildClientRedirect } from "@/lib/oauth";
import { settlePaymentIntent } from "@/lib/credits";
import { deliverPaymentWebhook } from "@/lib/webhooks";
import {
  cancelIntent,
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
    const cancelled = await cancelIntent(intent.id);
    if (cancelled) await deliverPaymentWebhook(cancelled);
    redirect(backTo(intent, "cancelled"));
  }

  const result = await settlePaymentIntent({
    intentId: intent.id,
    userId: user.id,
  });

  if (!result.ok) {
    if (result.reason === "insufficient_funds") {
      redirect(backTo(intent, "insufficient_funds"));
    }
    const status =
      result.reason === "not_pending" && result.intent?.status === "completed"
        ? "completed"
        : "cancelled";
    redirect(backTo(result.intent ?? intent, status));
  }

  await deliverPaymentWebhook(result.intent);
  redirect(backTo(result.intent, "completed"));
}
