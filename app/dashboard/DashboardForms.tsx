"use client";

import { useActionState, useState } from "react";
import {
  createOwnApp,
  regenerateSecret,
  updateAppRedirects,
  type AppState,
  type SecretState,
} from "./actions";
import { buildIntegrationPrompt } from "@/lib/integrationPrompt";

const secretInitial: SecretState = { ok: false, message: "" };
const appInitial: AppState = { ok: false, message: "" };

const inputClass = "input";
const buttonClass = "btn btn-primary text-sm";

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return (
    <p className={`text-sm ${ok ? "text-success" : "text-danger"}`}>
      {message}
    </p>
  );
}

/** Self-service: register a new provider app you own. */
export function NewAppForm() {
  const [state, action, pending] = useActionState(createOwnApp, appInitial);
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
        defaultValue="identify roles"
        placeholder="Scopes (identify roles credits)"
      />
      <button className={buttonClass} disabled={pending}>
        {pending ? "Registering…" : "Register app"}
      </button>
      <Notice ok={state.ok} message={state.message} />
      {state.ok && state.clientId && state.secret && (
        <div className="sunken space-y-1 p-3 font-mono text-xs break-all">
          <div>
            <span className="text-faint">client_id:</span> {state.clientId}
          </div>
          <div>
            <span className="text-faint">client_secret:</span> {state.secret}
          </div>
        </div>
      )}
    </form>
  );
}

function RegenerateSecret({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(regenerateSecret, secretInitial);
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="clientId" value={clientId} />
        <button
          className="link text-sm underline underline-offset-2 disabled:opacity-40"
          disabled={pending}
        >
          {pending ? "Regenerating…" : "Regenerate secret"}
        </button>
      </form>
      <Notice ok={state.ok} message={state.message} />
      {state.ok && state.secret && (
        <div className="sunken mt-1 p-2 font-mono text-xs break-all">
          {state.secret}
        </div>
      )}
    </div>
  );
}

function EditRedirects({
  clientId,
  redirectUris,
}: {
  clientId: string;
  redirectUris: string[];
}) {
  const [state, action, pending] = useActionState(updateAppRedirects, secretInitial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <textarea
        className={inputClass}
        name="redirectUris"
        rows={2}
        defaultValue={redirectUris.join("\n")}
      />
      <button
        className="link text-sm underline underline-offset-2 disabled:opacity-40"
        disabled={pending}
      >
        {pending ? "Saving…" : "Save redirect URIs"}
      </button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="w-28 shrink-0 text-faint">{label}</span>
      <span className="break-all text-muted">{value}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className={`${copied ? "btn btn-secondary" : "btn btn-primary"} shrink-0 text-sm`}
    >
      {copied ? "Copied!" : "Copy prompt"}
    </button>
  );
}

/**
 * Per-app setup: a ready-to-paste coding-agent prompt with this app's real
 * values filled in, plus the endpoint reference, redirect-URI editing, and
 * secret regeneration. The secret itself is only shown at creation/regeneration.
 */
export function AppSetup({
  appUrl,
  clientId,
  scopes,
  redirectUris,
}: {
  appUrl: string;
  clientId: string;
  scopes: string[];
  redirectUris: string[];
}) {
  const prompt = buildIntegrationPrompt({
    appUrl,
    clientId,
    redirectUri: redirectUris[0] ?? "https://your-site.example/callback",
    scopes,
  });

  return (
    <details className="group mt-3 text-xs">
      <summary className="link inline-flex cursor-pointer select-none items-center gap-1.5 text-sm underline underline-offset-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="transition-transform duration-200 group-open:rotate-90"
        >
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Setup instructions
      </summary>

      <div className="mt-3 space-y-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-muted">
              Paste this into your coding agent (Claude Code, Cursor, …). It has
              your values filled in — just add the client secret.
            </p>
            <CopyButton text={prompt} />
          </div>
          <pre className="sunken mt-2 max-h-72 overflow-auto p-3 font-mono whitespace-pre-wrap break-words text-muted">
{prompt}
          </pre>
        </div>

        <div className="space-y-1 font-mono">
          <Field label="Authorize" value={`${appUrl}/oauth/authorize`} />
          <Field label="Token" value={`${appUrl}/api/oauth/token`} />
          <Field label="Userinfo" value={`${appUrl}/api/oauth/userinfo`} />
          <Field label="Revoke" value={`${appUrl}/api/oauth/revoke`} />
          <Field label="Pay (intent)" value={`${appUrl}/api/pay/intent`} />
          <Field label="Pay (confirm)" value={`${appUrl}/pay`} />
          <Field label="Pay (verify)" value={`${appUrl}/api/pay/verify`} />
        </div>

        <div>
          <p className="mb-1 text-muted">Redirect URIs (must match exactly)</p>
          <EditRedirects clientId={clientId} redirectUris={redirectUris} />
        </div>

        <RegenerateSecret clientId={clientId} />
      </div>
    </details>
  );
}
