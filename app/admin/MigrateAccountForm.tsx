"use client";

import { useActionState } from "react";
import { migrateAccount, type ActionState } from "./actions";
import { AdminNotice } from "./AdminNotice";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type FormsDict = Dictionary["admin"]["forms"];

const initial: ActionState = { ok: false, message: "" };
const inputClass = "input";
const buttonClass = "btn btn-primary text-sm";

/** Move a member from an old Discord account to a new one (irreversible). */
export function MigrateAccountForm({
  t,
  confirmText,
}: {
  t: FormsDict;
  confirmText: string;
}) {
  const [state, action, pending] = useActionState(migrateAccount, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="space-y-3"
    >
      <input
        className={inputClass}
        name="fromDiscordId"
        aria-label={t.fromDiscordIdPlaceholder}
        placeholder={t.fromDiscordIdPlaceholder}
      />
      <input
        className={inputClass}
        name="toDiscordId"
        aria-label={t.toDiscordIdPlaceholder}
        placeholder={t.toDiscordIdPlaceholder}
      />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? t.migrating : t.migrate}
      </button>
      <AdminNotice ok={state.ok} message={state.message} />
    </form>
  );
}
