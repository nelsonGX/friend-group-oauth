import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getClientByClientId } from "@/lib/oauth";
import { getBalance } from "@/lib/credits";
import { getIntent } from "@/lib/payments";
import { confirmPayment } from "./actions";

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card w-full max-w-md p-8 text-center">
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
  const sp = await searchParams;
  const intentId = Array.isArray(sp.intent) ? sp.intent[0] : sp.intent;
  if (!intentId) {
    return <Notice title="Invalid request" message="No payment specified." />;
  }

  const intent = await getIntent(intentId);
  if (!intent) {
    return <Notice title="Unknown payment" message="This payment link is not valid." />;
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?return=${encodeURIComponent(`/pay?intent=${intentId}`)}`);
  }

  if (intent.status === "completed") {
    return <Notice title="Already paid" message="This payment has already been completed." />;
  }
  if (intent.status === "cancelled") {
    return <Notice title="Cancelled" message="This payment was cancelled." />;
  }
  if (intent.expiresAt < new Date()) {
    return <Notice title="Expired" message="This payment request has expired." />;
  }
  if (!user.allowed) {
    return (
      <Notice
        title="No access"
        message="You don't have access to this platform yet."
      />
    );
  }

  const client = await getClientByClientId(intent.clientId);
  const balance = await getBalance(user.id);
  const insufficient = balance < intent.amount;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card w-full max-w-md p-8">
        <p className="text-xs uppercase tracking-wide text-faint">
          Confirm payment
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Pay <span className="text-ink">{client?.name ?? intent.clientId}</span>
        </h1>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Amount</span>
            <span className="text-3xl font-semibold tracking-tight">
              {intent.amount}
              <span className="ml-1.5 text-base font-normal text-muted">
                credits
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
          <span className="text-muted">Your balance</span>
          <span className="font-medium">
            {balance}
            {!insufficient && (
              <span className="text-faint">
                {" "}
                → <span className="text-success">{balance - intent.amount}</span>{" "}
                after
              </span>
            )}
          </span>
        </div>

        {insufficient && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            Insufficient credits — you need {intent.amount - balance} more.
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
            Cancel
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={insufficient}
            className="btn btn-primary flex-1"
          >
            Pay {intent.amount}
          </button>
        </form>
      </div>
    </main>
  );
}
