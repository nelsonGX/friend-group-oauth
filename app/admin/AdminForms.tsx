"use client";

import { useActionState } from "react";
import {
  createClient,
  grantCredits,
  type ActionState,
} from "./actions";

const initial: ActionState = { ok: false, message: "" };

const inputClass = "input";
const buttonClass = "btn btn-primary text-sm";

export function GrantCreditsForm() {
  const [state, action, pending] = useActionState(grantCredits, initial);
  return (
    <form action={action} className="space-y-3">
      <input className={inputClass} name="discordId" placeholder="Discord user ID" />
      <input className={inputClass} name="amount" type="number" min="1" placeholder="Amount (credits)" />
      <input className={inputClass} name="reason" placeholder="Reason (optional)" />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Granting…" : "Grant credits"}
      </button>
      {state.message && (
        <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function NewClientForm() {
  const [state, action, pending] = useActionState(createClient, initial);
  return (
    <form action={action} className="space-y-3">
      <input className={inputClass} name="name" placeholder="App name" />
      <textarea
        className={inputClass}
        name="redirectUris"
        rows={2}
        placeholder="Redirect URIs (one per line or comma-separated)"
      />
      <input
        className={inputClass}
        name="scopes"
        defaultValue="identify"
        placeholder="Scopes (e.g. identify roles credits)"
      />
      <input className={inputClass} name="ownerDiscordId" placeholder="Owner Discord ID (optional)" />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="trusted" className="accent-brand" />
        Trusted (skip the consent screen)
      </label>
      <button className={buttonClass} disabled={pending}>
        {pending ? "Creating…" : "Create client"}
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
