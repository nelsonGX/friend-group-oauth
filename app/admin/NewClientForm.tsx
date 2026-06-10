"use client";

import { useActionState } from "react";
import { createClient, type ActionState } from "./actions";
import { AdminNotice } from "./AdminNotice";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type FormsDict = Dictionary["admin"]["forms"];

const initial: ActionState = { ok: false, message: "" };
const inputClass = "input";
const buttonClass = "btn btn-primary text-sm";

export function NewClientForm({ t }: { t: FormsDict }) {
  const [state, action, pending] = useActionState(createClient, initial);
  return (
    <form action={action} className="space-y-3">
      <input
        className={inputClass}
        name="name"
        aria-label={t.appNamePlaceholder}
        placeholder={t.appNamePlaceholder}
      />
      <textarea
        className={inputClass}
        name="redirectUris"
        aria-label={t.redirectUrisPlaceholder}
        rows={2}
        placeholder={t.redirectUrisPlaceholder}
      />
      <input
        className={inputClass}
        name="scopes"
        aria-label={t.scopesPlaceholder}
        defaultValue="identify"
        placeholder={t.scopesPlaceholder}
      />
      <input
        className={inputClass}
        name="ownerDiscordId"
        aria-label={t.ownerDiscordIdPlaceholder}
        placeholder={t.ownerDiscordIdPlaceholder}
      />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="trusted" className="accent-brand" />
        {t.trustedLabel}
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? t.creating : t.createClient}
      </button>
      <AdminNotice ok={state.ok} message={state.message} />
      {state.ok && state.clientId && state.secret && (
        <div className="sunken p-3 font-mono text-xs break-all">
          <div>
            <span className="text-faint">client_id:</span> {state.clientId}
          </div>
          <div className="mt-1">
            <span className="text-faint">client_secret:</span> {state.secret}
          </div>
        </div>
      )}
    </form>
  );
}
