"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import Image from "next/image";
import { Loader2, RotateCw } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type LoginDict = Dictionary["login"];
type Phase = "starting" | "ready" | "approved" | "expired" | "error";
type HandoffState = {
  phase: Phase;
  qr: string | null;
};
type HandoffAction =
  | { type: "starting" }
  | { type: "ready"; qr: string }
  | { type: "approved" }
  | { type: "expired" }
  | { type: "error" };

function handoffReducer(
  _state: HandoffState,
  action: HandoffAction,
): HandoffState {
  switch (action.type) {
    case "starting":
      return { phase: "starting", qr: null };
    case "ready":
      return { phase: "ready", qr: action.qr };
    case "approved":
      return { phase: "approved", qr: null };
    case "expired":
      return { phase: "expired", qr: null };
    case "error":
      return { phase: "error", qr: null };
  }
}

/**
 * Desktop side of the cross-device login hand-off. Starts a hand-off, renders
 * the returned QR (a phone scans it, signs in, and approves), and polls until
 * the server reports approval — at which point our session cookie is set and we
 * reload into `returnPath`, now signed in. The secret poll token lives only in
 * this component's closure; the QR carries only the public id.
 */
export function PhoneHandoff({
  returnPath,
  t,
}: {
  returnPath: string;
  t: LoginDict;
}) {
  const [{ phase, qr }, dispatch] = useReducer(handoffReducer, {
    phase: "starting",
    qr: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startHandoff = useCallback(() => {
    cleanupRef.current?.();

    let cancelled = false;
    let pollToken = "";
    let intervalMs = 3000;

    const schedule = () => {
      timerRef.current = setTimeout(poll, intervalMs);
    };

    async function poll() {
      try {
        const res = await fetch("/api/auth/handoff/poll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ poll_token: pollToken }),
        });
        const data = (await res.json()) as { status?: string };
        if (cancelled) return;
        switch (data.status) {
          case "approved":
            dispatch({ type: "approved" });
            window.location.assign(returnPath);
            return;
          case "expired":
          case "invalid":
          case "denied":
            dispatch({ type: "expired" });
            return;
          default:
            schedule();
        }
      } catch {
        // Transient network error — keep polling rather than giving up.
        if (!cancelled) schedule();
      }
    }

    async function start() {
      dispatch({ type: "starting" });
      try {
        const res = await fetch("/api/auth/handoff/start", { method: "POST" });
        if (!res.ok) throw new Error("start failed");
        const data = (await res.json()) as {
          poll_token: string;
          qr: string;
          interval?: number;
        };
        if (cancelled) return;
        pollToken = data.poll_token;
        intervalMs = Math.max(1, Number(data.interval) || 3) * 1000;
        dispatch({ type: "ready", qr: data.qr });
        schedule();
      } catch {
        if (!cancelled) dispatch({ type: "error" });
      }
    }

    const cleanup = () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    cleanupRef.current = cleanup;

    start();
    return cleanup;
  }, [returnPath]);

  useEffect(() => {
    const cleanup = startHandoff();
    return cleanup;
  }, [startHandoff]);

  return (
    <div className="mt-7">
      <div className="flex items-center gap-3 text-faint">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide">
          {t.continueOnPhone}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        {phase === "ready" && qr ? (
          <>
            <div className="rounded-xl bg-white p-3 ring-1 ring-border">
              <Image
                src={qr}
                alt=""
                width={160}
                height={160}
                unoptimized
                className="block h-40 w-40"
              />
            </div>
            <p className="text-xs text-faint">{t.phoneHint}</p>
          </>
        ) : phase === "approved" ? (
          <div className="grid h-[10.5rem] w-[10.5rem] place-items-center rounded-xl border border-success/30 bg-success/10 text-success">
            <Loader2 size={28} className="animate-spin" strokeWidth={1.8} />
          </div>
        ) : phase === "expired" || phase === "error" ? (
          <div className="flex flex-col items-center gap-3">
            <div className="grid h-[10.5rem] w-[10.5rem] place-items-center rounded-xl border border-dashed border-border bg-surface px-4 text-center text-xs text-faint">
              {phase === "expired" ? t.phoneExpired : t.phoneError}
            </div>
            <button
              type="button"
              onClick={startHandoff}
              className="btn btn-ghost text-sm"
            >
              <RotateCw size={15} strokeWidth={1.9} />
              {t.phoneRetry}
            </button>
          </div>
        ) : (
          // starting
          <div className="grid h-[10.5rem] w-[10.5rem] animate-pulse place-items-center rounded-xl border border-border bg-surface text-faint">
            <Loader2 size={24} className="animate-spin" strokeWidth={1.8} />
          </div>
        )}

        {phase === "approved" && (
          <p className="text-xs text-success">{t.phoneApproved}</p>
        )}
      </div>
    </div>
  );
}
