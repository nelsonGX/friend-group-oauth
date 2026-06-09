"use client";

import { useActionState } from "react";
import {
  createClient,
  grantCredits,
  type ActionState,
} from "./actions";

const initial: ActionState = { ok: false, message: "" };

const inputClass =
  "w-full rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";
const buttonClass =
  "rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4] disabled:opacity-50";

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
        <p className={`text-sm ${state.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="trusted" />
        Trusted (skip the consent screen)
      </label>
      <button className={buttonClass} disabled={pending}>
        {pending ? "Creating…" : "Create client"}
      </button>
      {state.message && (
        <p className={`text-sm ${state.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {state.message}
        </p>
      )}
      {state.ok && state.clientId && state.secret && (
        <div className="rounded-md bg-black/5 dark:bg-white/10 p-3 font-mono text-xs break-all">
          <div>
            <span className="opacity-60">client_id:</span> {state.clientId}
          </div>
          <div className="mt-1">
            <span className="opacity-60">client_secret:</span> {state.secret}
          </div>
        </div>
      )}
    </form>
  );
}
