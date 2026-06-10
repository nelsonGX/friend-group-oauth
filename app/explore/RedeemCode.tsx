"use client";

import { useActionState, useEffect, useRef } from "react";
import { Ticket } from "lucide-react";
import { redeemCreditCode, type RedeemState } from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type RedeemDict = Dictionary["explore"]["redeem"];

const initial: RedeemState = { ok: false, message: "" };

/** "Redeem a code" panel: exchange an admin-minted code for credits. */
export function RedeemCode({ t }: { t: RedeemDict }) {
  const [state, action, pending] = useActionState(redeemCreditCode, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the field after a successful redemption so it's ready to reuse.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="card card-hover-border p-6">
      <div className="flex items-center gap-2.5">
        <Ticket size={18} className="text-brand-soft" />
        <h2 className="text-lg font-semibold">{t.heading}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">{t.desc}</p>

      <form ref={formRef} action={action} className="mt-4 space-y-3">
        <input
          className="input font-mono uppercase tracking-wide"
          name="code"
          aria-label={t.placeholder}
          placeholder={t.placeholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-primary w-full text-sm" disabled={pending}>
          <Ticket size={15} />
          {pending ? t.redeeming : t.redeem}
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
