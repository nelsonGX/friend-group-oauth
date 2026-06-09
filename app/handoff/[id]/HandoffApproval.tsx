"use client";

import { useActionState } from "react";
import { Check, MonitorSmartphone, ShieldAlert } from "lucide-react";
import { decideHandoff, type HandoffDecisionState } from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type HandoffDict = Dictionary["handoff"];

const initial: HandoffDecisionState = { status: "idle", message: "" };

/**
 * The approve/reject panel a phone shows after scanning the login QR. The
 * warning is the anti-phishing guard for the device flow: only approve a
 * sign-in you yourself just started elsewhere. On a decision it swaps to a
 * confirmation ("you're signed in on the other device" / "cancelled").
 */
export function HandoffApproval({
  publicId,
  displayName,
  t,
}: {
  publicId: string;
  displayName: string;
  t: HandoffDict;
}) {
  const [state, action, pending] = useActionState(decideHandoff, initial);

  if (state.status === "approved" || state.status === "denied") {
    const ok = state.status === "approved";
    return (
      <div className="reveal card card-hover w-full max-w-md p-8 text-center">
        <span
          className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${
            ok
              ? "border border-success/30 bg-success/10 text-success"
              : "border border-border bg-surface-strong text-muted"
          }`}
        >
          <Check size={24} strokeWidth={1.7} />
        </span>
        <h1 className="mt-4 text-lg font-semibold">
          {ok ? t.approvedTitle : t.deniedTitle}
        </h1>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="reveal card card-hover-border w-full max-w-md p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <MonitorSmartphone size={22} strokeWidth={1.7} />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-faint">{t.title}</p>
          <h1 className="text-xl font-semibold leading-tight">
            {t.signedInAs.replace("{name}", displayName)}
          </h1>
        </div>
      </div>

      <p className="mt-5 text-sm text-muted">{t.intro}</p>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-ink">
        <span className="mt-0.5 shrink-0 text-danger">
          <ShieldAlert size={18} strokeWidth={1.8} />
        </span>
        <span>{t.warning}</span>
      </div>

      {state.status !== "idle" && state.message && (
        <p className="mt-4 text-sm text-danger">{state.message}</p>
      )}

      <form action={action} className="mt-6 flex gap-3">
        <input type="hidden" name="public_id" value={publicId} />
        <button
          type="submit"
          name="decision"
          value="deny"
          disabled={pending}
          className="btn btn-ghost flex-1"
        >
          {t.reject}
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
    </div>
  );
}
