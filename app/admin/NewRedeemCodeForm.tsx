"use client";

import { useActionState } from "react";
import { createRedeemCode, type ActionState } from "./actions";
import { AdminNotice } from "./AdminNotice";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type FormsDict = Dictionary["admin"]["forms"];

const initial: ActionState = { ok: false, message: "" };
const inputClass = "input";
const buttonClass = "btn btn-primary text-sm";

export function NewRedeemCodeForm({ t }: { t: FormsDict }) {
  const [state, action, pending] = useActionState(createRedeemCode, initial);
  return (
    <form action={action} className="space-y-3">
      <input
        className={inputClass}
        name="amount"
        type="number"
        min="1"
        aria-label={t.amountPlaceholder}
        placeholder={t.amountPlaceholder}
      />
      <input
        className={inputClass}
        name="maxRedemptions"
        type="number"
        min="1"
        aria-label={t.maxRedemptionsPlaceholder}
        placeholder={t.maxRedemptionsPlaceholder}
      />
      <input
        className={inputClass}
        name="expiresInDays"
        type="number"
        min="1"
        aria-label={t.expiresInDaysPlaceholder}
        placeholder={t.expiresInDaysPlaceholder}
      />
      <input
        className={inputClass}
        name="code"
        aria-label={t.customCodePlaceholder}
        placeholder={t.customCodePlaceholder}
      />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? t.creatingCode : t.createCode}
      </button>
      <AdminNotice ok={state.ok} message={state.message} />
      {state.ok && state.code && (
        <div className="sunken p-3 font-mono text-sm tracking-wide break-all">
          {state.code}
        </div>
      )}
    </form>
  );
}
