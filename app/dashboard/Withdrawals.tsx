"use client";

import { useActionState, useState } from "react";
import { Banknote } from "lucide-react";
import { requestWithdrawal, cancelWithdrawal, type WithdrawState } from "./actions";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type WithdrawDict = Dictionary["dashboard"]["withdraw"];

export interface WithdrawalRow {
  id: string;
  /** Pre-formatted on the server — Dates can't cross to client components. */
  date: string;
  amount: number;
  status: string;
  payoutDetails: string;
  note: string | null;
  adminNote: string | null;
}

const initial: WithdrawState = { ok: false, message: "" };

const STATUS_BADGE: Record<string, string> = {
  pending: "badge",
  paid: "badge badge-success",
  rejected: "badge badge-danger",
  cancelled: "badge badge-danger",
};

function statusLabel(status: string, t: WithdrawDict): string {
  switch (status) {
    case "paid":
      return t.statusPaid;
    case "rejected":
      return t.statusRejected;
    case "cancelled":
      return t.statusCancelled;
    default:
      return t.statusPending;
  }
}

/**
 * The developer's payout panel: how much of their earnings they can cash out, a
 * form to request a withdrawal (amount + free-text payout details), and the
 * status of past requests with a cancel button while still pending.
 */
export function Withdrawals({
  available,
  earned,
  reserved,
  entries,
  t,
}: {
  available: number;
  earned: number;
  reserved: number;
  entries: WithdrawalRow[];
  t: WithdrawDict;
}) {
  const [state, action, pending] = useActionState(requestWithdrawal, initial);
  const [amount, setAmount] = useState("");

  return (
    <section>
      <div className="flex items-center gap-2.5">
        <Banknote size={18} className="text-brand-soft" />
        <h2 className="text-lg font-semibold">{t.heading}</h2>
      </div>
      <p className="mt-1 max-w-xl text-sm text-muted">{t.desc}</p>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {/* available + request form */}
        <div className="card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t.available}
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{available}</span>
            <span className="text-sm text-muted">
              {format(t.ofEarned, { earned })}
            </span>
          </p>
          {reserved > 0 && (
            <p className="mt-1 text-xs text-faint">
              {format(t.reservedNote, { n: reserved })}
            </p>
          )}

          {available <= 0 ? (
            <p className="mt-4 text-sm text-muted">{t.nothing}</p>
          ) : (
            <form action={action} className="mt-5 space-y-3">
              <div className="relative">
                <input
                  className="input !pr-16"
                  name="amount"
                  type="number"
                  min="1"
                  max={available}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t.amountPlaceholder}
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(available))}
                  className="link absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                >
                  {t.max}
                </button>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  {t.payoutLabel}
                </label>
                <textarea
                  className="input"
                  name="payoutDetails"
                  rows={3}
                  placeholder={t.payoutPlaceholder}
                />
                <p className="mt-1 text-xs text-faint">{t.payoutHint}</p>
              </div>
              <input className="input" name="note" placeholder={t.notePlaceholder} />
              <button className="btn btn-primary text-sm" disabled={pending}>
                {pending ? t.submitting : t.submit}
              </button>
              {state.message && (
                <p
                  className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}
                >
                  {state.message}
                </p>
              )}
            </form>
          )}
        </div>

        {/* request history */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {t.requestsHeading}
          </p>
          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t.empty}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {entries.map((w) => (
                <li key={w.id} className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-lg font-semibold tabular-nums">
                      {w.amount}
                    </span>
                    <span className={STATUS_BADGE[w.status] ?? "badge"}>
                      {statusLabel(w.status, t)}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-faint">{w.date}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted">
                    {w.payoutDetails}
                  </p>
                  {w.adminNote && (
                    <p className="mt-2 text-xs text-muted">
                      <span className="text-faint">{t.adminNoteLabel}: </span>
                      {w.adminNote}
                    </p>
                  )}
                  {w.status === "pending" && (
                    <form
                      action={cancelWithdrawal}
                      className="mt-3"
                      onSubmit={(e) => {
                        if (!confirm(t.cancelConfirm)) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={w.id} />
                      <button className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
                        {t.cancel}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
