"use client";

import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  regenerateSecret,
  updateAppRedirects,
  type SecretState,
} from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type FormsDict = Dictionary["dashboard"]["forms"];

const secretInitial: SecretState = { ok: false, message: "" };

const inputClass = "input";

export function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return (
    <p className={`text-sm ${ok ? "text-success" : "text-danger"}`}>
      {message}
    </p>
  );
}

export function RegenerateSecret({
  clientId,
  t,
}: {
  clientId: string;
  t: FormsDict;
}) {
  const [state, action, pending] = useActionState(regenerateSecret, secretInitial);
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="clientId" value={clientId} />
        <button className="btn btn-secondary text-sm" disabled={pending}>
          {pending ? t.regenerating : t.regenerateSecret}
        </button>
      </form>
      <div className="mt-2">
        <Notice ok={state.ok} message={state.message} />
      </div>
      {state.ok && state.secret && (
        <div className="sunken mt-1 p-2 font-mono text-xs break-all">
          {state.secret}
        </div>
      )}
      {state.ok && state.prompt && <OneShotPrompt prompt={state.prompt} t={t} />}
    </div>
  );
}

export function EditRedirects({
  clientId,
  redirectUris,
  t,
}: {
  clientId: string;
  redirectUris: string[];
  t: FormsDict;
}) {
  const [state, action, pending] = useActionState(updateAppRedirects, secretInitial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <textarea
        className={inputClass}
        name="redirectUris"
        rows={3}
        defaultValue={redirectUris.join("\n")}
      />
      <button className="btn btn-secondary text-sm" disabled={pending}>
        {pending ? t.saving : t.saveRedirectUris}
      </button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="w-28 shrink-0 text-faint">{label}</span>
      <span className="break-all text-muted">{value}</span>
    </div>
  );
}

export function CopyButton({ text, t }: { text: string; t: FormsDict }) {
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
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? t.copied : t.copyPrompt}
    </button>
  );
}

/**
 * Renders a complete, copy-paste integration prompt with the freshly issued
 * secret baked in. Shown only at creation/regeneration — the one moment the
 * plaintext secret exists (it's hashed at rest and never recoverable after).
 */
export function OneShotPrompt({ prompt, t }: { prompt: string; t: FormsDict }) {
  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted">{t.pastePrompt}</p>
        <CopyButton text={prompt} t={t} />
      </div>
      <pre className="sunken mt-2 max-h-72 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap break-words text-muted">
{prompt}
      </pre>
    </div>
  );
}
