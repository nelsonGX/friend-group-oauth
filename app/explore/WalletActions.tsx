"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { transferCredits, type TransferState } from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type WalletDict = Dictionary["explore"]["wallet"];

const initial: TransferState = { ok: false, message: "" };

/** "Send credits" panel: a peer-to-peer transfer form on the member wallet. */
export function WalletActions({ t }: { t: WalletDict }) {
  const [state, action, pending] = useActionState(transferCredits, initial);

  return (
    <section className="card card-hover-border p-6">
      <div className="flex items-center gap-2.5">
        <Send size={18} className="text-brand-soft" />
        <h2 className="text-lg font-semibold">{t.sendHeading}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">{t.sendDesc}</p>

      <form action={action} className="mt-4 space-y-3">
        <input
          className="input"
          name="recipient"
          placeholder={t.recipientPlaceholder}
          autoComplete="off"
        />
        <input
          className="input"
          name="amount"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder={t.amountPlaceholder}
        />
        <input className="input" name="note" placeholder={t.notePlaceholder} />
        <button className="btn btn-primary w-full text-sm" disabled={pending}>
          <Send size={15} />
          {pending ? t.sending : t.send}
        </button>
        {state.message && (
          <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
            {state.message}
          </p>
        )}
      </form>
    </section>
  );
}
