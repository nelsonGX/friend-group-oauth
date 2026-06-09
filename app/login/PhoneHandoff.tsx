"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type LoginDict = Dictionary["login"];
type Phase = "starting" | "ready" | "approved" | "expired" | "error";

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
  const [phase, setPhase] = useState<Phase>("starting");
  const [qr, setQr] = useState<string | null>(null);
  // Bumping this restarts the effect to mint a fresh hand-off after expiry.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pollToken = "";
    let intervalMs = 3000;

    const schedule = () => {
      timer = setTimeout(poll, intervalMs);
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
            setPhase("approved");
            window.location.assign(returnPath);
            return;
          case "expired":
          case "invalid":
          case "denied":
            setPhase("expired");
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
      setPhase("starting");
      setQr(null);
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
        setQr(data.qr);
        setPhase("ready");
        schedule();
      } catch {
        if (!cancelled) setPhase("error");
      }
    }

    start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [returnPath, attempt]);

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
            <div
              className="rounded-xl bg-white p-3 ring-1 ring-border [&>svg]:block [&>svg]:h-40 [&>svg]:w-40"
              // QR SVG is generated server-side from our own URL — trusted markup.
              dangerouslySetInnerHTML={{ __html: qr }}
            />
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
              onClick={() => setAttempt((n) => n + 1)}
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
