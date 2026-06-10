import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import { getClientByClientId } from "@/lib/oauth";
import { getBalance } from "@/lib/credits";
import { getIntent } from "@/lib/payments";
import { confirmPayment } from "./actions";

export const metadata: Metadata = {
  title: "Confirm payment | Friend Group Auth",
  description: "Review and approve a credit payment request.",
};

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card card-hover w-full max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </main>
  );
}

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, { t }] = await Promise.all([searchParams, getDictionary()]);
  const n = t.pay.notices;
  const intentId = Array.isArray(sp.intent) ? sp.intent[0] : sp.intent;
  if (!intentId) {
    return <Notice title={n.invalidRequestTitle} message={n.invalidRequestMsg} />;
  }

  const intent = await getIntent(intentId);
  if (!intent) {
    return <Notice title={n.unknownTitle} message={n.unknownMsg} />;
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?return=${encodeURIComponent(`/pay?intent=${intentId}`)}`);
  }

  if (intent.status === "completed") {
    return <Notice title={n.alreadyPaidTitle} message={n.alreadyPaidMsg} />;
  }
  if (intent.status === "cancelled") {
    return <Notice title={n.cancelledTitle} message={n.cancelledMsg} />;
  }
  if (intent.expiresAt < new Date()) {
    return <Notice title={n.expiredTitle} message={n.expiredMsg} />;
  }
  if (!user.allowed) {
    return <Notice title={n.noAccessTitle} message={n.noAccessMsg} />;
  }

  const [client, balance] = await Promise.all([
    getClientByClientId(intent.clientId),
    getBalance(user.id),
  ]);
  const insufficient = balance < intent.amount;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card card-hover-border w-full max-w-md p-8">
        <p className="text-xs uppercase tracking-wide text-faint">
          {t.pay.confirmPayment}
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          {t.pay.payTo.split("{name}")[0]}
          <span className="text-ink">{client?.name ?? intent.clientId}</span>
          {t.pay.payTo.split("{name}")[1] ?? ""}
        </h1>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">{t.pay.amount}</span>
            <span className="text-3xl font-semibold tracking-tight">
              {intent.amount}
              <span className="ml-1.5 text-base font-normal text-muted">
                {t.pay.credits}
              </span>
            </span>
          </div>
          {intent.description && (
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
              {intent.description}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <span className="text-muted">{t.pay.yourBalance}</span>
          <span className="font-medium">
            {balance}
            {!insufficient && (
              <span className="text-faint">
                {" "}
                → <span className="text-success">{balance - intent.amount}</span>{" "}
                {t.pay.after}
              </span>
            )}
          </span>
        </div>

        {insufficient && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {format(t.pay.insufficient, { needed: intent.amount - balance })}
          </p>
        )}

        <form action={confirmPayment} className="mt-6 flex gap-3">
          <input type="hidden" name="intent_id" value={intent.id} />
          <button
            type="submit"
            name="decision"
            value="cancel"
            className="btn btn-ghost flex-1"
          >
            {t.pay.cancel}
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={insufficient}
            className="btn btn-primary flex-1"
          >
            {format(t.pay.payAmount, { amount: intent.amount })}
          </button>
        </form>
      </div>
    </main>
  );
}
