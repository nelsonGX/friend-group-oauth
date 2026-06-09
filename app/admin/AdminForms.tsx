"use client";

import { useActionState, useEffect } from "react";
import {
  createClient,
  grantCredits,
  type ActionState,
} from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type FormsDict = Dictionary["admin"]["forms"];

const initial: ActionState = { ok: false, message: "" };

const inputClass = "input";
const buttonClass = "btn btn-primary text-sm";

/**
 * The Discord ID field is controlled by the parent so a "Grant" button in the
 * users table can target a specific user. Other fields stay uncontrolled.
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

  // Clear the targeted user once a grant lands, so the field is ready to reuse.
  useEffect(() => {
    if (state.ok) onDiscordIdChange("");
  }, [state, onDiscordIdChange]);

  return (
    <form action={action} className="space-y-3">
      <input
        className={inputClass}
        name="discordId"
        placeholder={t.discordIdPlaceholder}
        value={discordId}
        onChange={(e) => onDiscordIdChange(e.target.value)}
      />
      <input className={inputClass} name="amount" type="number" min="1" placeholder={t.amountPlaceholder} />
      <input className={inputClass} name="reason" placeholder={t.reasonPlaceholder} />
      <button className={buttonClass} disabled={pending}>
        {pending ? t.granting : t.grantCredits}
      </button>
      {state.message && (
        <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function NewClientForm({ t }: { t: FormsDict }) {
  const [state, action, pending] = useActionState(createClient, initial);
  return (
    <form action={action} className="space-y-3">
      <input className={inputClass} name="name" placeholder={t.appNamePlaceholder} />
      <textarea
        className={inputClass}
        name="redirectUris"
        rows={2}
        placeholder={t.redirectUrisPlaceholder}
      />
      <input
        className={inputClass}
        name="scopes"
        defaultValue="identify"
        placeholder={t.scopesPlaceholder}
      />
      <input className={inputClass} name="ownerDiscordId" placeholder={t.ownerDiscordIdPlaceholder} />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="trusted" className="accent-brand" />
        {t.trustedLabel}
      </label>
      <button className={buttonClass} disabled={pending}>
        {pending ? t.creating : t.createClient}
      </button>
      {state.message && (
        <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
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
