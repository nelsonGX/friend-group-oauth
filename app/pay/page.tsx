import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getClientByClientId } from "@/lib/oauth";
import { getBalance } from "@/lib/credits";
import { getIntent } from "@/lib/payments";
import { confirmPayment } from "./actions";

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-black/10 dark:border-white/15 p-8 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm opacity-80">{message}</p>
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
      <div className="w-full max-w-md rounded-xl border border-black/10 dark:border-white/15 p-8">
        <h1 className="text-xl font-semibold">Confirm payment</h1>
        <p className="mt-1 text-sm opacity-70">
          to <span className="font-medium">{client?.name ?? intent.clientId}</span>
        </p>

        <div className="mt-6 rounded-lg bg-black/5 dark:bg-white/5 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm opacity-70">Amount</span>
            <span className="text-2xl font-semibold">{intent.amount} credits</span>
          </div>
          {intent.description && (
            <p className="mt-2 text-sm opacity-80">{intent.description}</p>
          )}
        </div>

        <p className="mt-4 text-sm opacity-70">
          Your balance:{" "}
          <span className="font-medium">{balance} credits</span>
          {!insufficient && (
            <> → {balance - intent.amount} after payment</>
          )}
        </p>

        {insufficient && (
          <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            Insufficient credits. You need {intent.amount - balance} more.
          </p>
        )}

        <form action={confirmPayment} className="mt-6 flex gap-3">
          <input type="hidden" name="intent_id" value={intent.id} />
          <button
            type="submit"
            name="decision"
            value="cancel"
            className="flex-1 rounded-md border border-black/15 dark:border-white/20 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={insufficient}
            className="flex-1 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pay {intent.amount}
          </button>
        </form>
      </div>
    </main>
  );
}
