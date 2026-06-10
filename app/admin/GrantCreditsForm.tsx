"use client";

import { useActionState } from "react";
import { grantCredits, type ActionState } from "./actions";
import { AdminNotice } from "./AdminNotice";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type FormsDict = Dictionary["admin"]["forms"];

const initial: ActionState = { ok: false, message: "" };
const inputClass = "input";
const buttonClass = "btn btn-primary text-sm";

/**
 * Adjust credits for a Discord user. The target Discord ID is controlled by
 * the admin page so table row actions can prefill this field.
 */
export function GrantCreditsForm({
  t,
  discordId,
  onDiscordIdChange,
}: {
  t: FormsDict;
  discordId: string;
  onDiscordIdChange: (value: string) => void;
}) {
  const [state, action, pending] = useActionState(grantCredits, initial);

  return (
    <form action={action} className="space-y-3">
      <input
        className={inputClass}
        name="discordId"
        aria-label={t.discordIdPlaceholder}
        placeholder={t.discordIdPlaceholder}
        value={discordId}
        onChange={(e) => onDiscordIdChange(e.target.value)}
      />
      <input
        className={inputClass}
        name="amount"
        type="number"
        step="1"
        aria-label={t.amountPlaceholder}
        placeholder={t.amountPlaceholder}
      />
      <input
        className={inputClass}
        name="reason"
        aria-label={t.reasonPlaceholder}
        placeholder={t.reasonPlaceholder}
      />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? t.granting : t.grantCredits}
      </button>
      <AdminNotice ok={state.ok} message={state.message} />
    </form>
  );
}
