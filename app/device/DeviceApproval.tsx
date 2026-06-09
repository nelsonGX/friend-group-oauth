"use client";

import { useActionState } from "react";
import { Check, ShieldCheck, Terminal } from "lucide-react";
import { decideDevice, type DeviceDecisionState } from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type DeviceDict = Dictionary["device"];

const initial: DeviceDecisionState = { status: "idle", message: "" };

/**
 * The approve/deny consent panel for a device authorization. Shows the proposed
 * app name, redirect URIs, and scopes, then on a decision swaps to a terminal
 * "return to your terminal" / "denied" confirmation.
 */
export function DeviceApproval({
  userCode,
  name,
  redirectUris,
  scopes,
  scopeLabels,
  t,
}: {
  userCode: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  scopeLabels: Record<string, string>;
  t: DeviceDict;
}) {
  const [state, action, pending] = useActionState(decideDevice, initial);

  if (state.status === "approved" || state.status === "denied") {
    const ok = state.status === "approved";
    return (
      <div className="reveal card w-full max-w-md p-8 text-center">
        <span
          className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${
            ok
              ? "bg-success/10 text-success border border-success/30"
              : "bg-surface-strong text-muted border border-border"
          }`}
        >
          {ok ? <Terminal size={24} strokeWidth={1.7} /> : <Check size={24} strokeWidth={1.7} />}
        </span>
        <h1 className="mt-4 text-lg font-semibold">
          {ok ? t.approvedTitle : t.deniedTitle}
        </h1>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="reveal card w-full max-w-md p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-soft to-violet text-white shadow-[0_12px_30px_-12px_rgba(88,101,242,0.9)]">
          <ShieldCheck size={22} strokeWidth={1.7} />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-faint">{t.title}</p>
          <h1 className="text-xl font-semibold leading-tight">{name}</h1>
        </div>
      </div>

      <p className="mt-5 text-sm text-muted">{t.intro}</p>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t.redirectUrisLabel}
          </p>
          <ul className="mt-1.5 space-y-1">
            {redirectUris.map((uri) => (
              <li
                key={uri}
                className="sunken break-all rounded-lg px-3 py-2 font-mono text-xs text-muted"
              >
                {uri}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t.scopesLabel}
          </p>
          <ul className="mt-1.5 space-y-2">
            {scopes.map((s) => (
              <li
                key={s}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand-soft">
                  <Check size={12} strokeWidth={2.4} />
                </span>
                <span>{scopeLabels[s] ?? s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {state.status !== "idle" && state.message && (
        <p className="mt-4 text-sm text-danger">{state.message}</p>
      )}

      <form action={action} className="mt-6 flex gap-3">
        <input type="hidden" name="user_code" value={userCode} />
        <button
          type="submit"
          name="decision"
          value="deny"
          disabled={pending}
          className="btn btn-ghost flex-1"
        >
          {t.deny}
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="btn btn-primary flex-1"
        >
          {pending ? t.approving : t.approve}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-faint">{t.footnote}</p>
    </div>
  );
}
