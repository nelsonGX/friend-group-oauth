"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { AdminSearchBox } from "./AdminSearchBox";
import { markWithdrawalPaid, rejectWithdrawal } from "./actions";
import { format } from "@/lib/i18n/format";
import type { AdminWithdrawalView } from "./AdminTypes";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type AdminDict = Dictionary["admin"];

const W_STATUS_BADGE: Record<string, string> = {
  pending: "badge",
  paid: "badge badge-success",
  rejected: "badge badge-danger",
  cancelled: "badge badge-danger",
};

function withdrawalStatusLabel(status: string, t: AdminDict): string {
  switch (status) {
    case "paid":
      return t.wStatusPaid;
    case "rejected":
      return t.wStatusRejected;
    case "cancelled":
      return t.wStatusCancelled;
    default:
      return t.wStatusPending;
  }
}

export function WithdrawalsSection({
  withdrawals,
  t,
}: {
  withdrawals: AdminWithdrawalView[];
  t: AdminDict;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return withdrawals;
    return withdrawals.filter(
      (w) =>
        w.userName.toLowerCase().includes(q) ||
        w.userDiscordId.toLowerCase().includes(q) ||
        w.payoutDetails.toLowerCase().includes(q),
    );
  }, [withdrawals, query]);
  const pending = useMemo(
    () => withdrawals.filter((w) => w.status === "pending"),
    [withdrawals],
  );
  const pendingTotal = pending.reduce((sum, w) => sum + w.amount, 0);

  return (
    <section className="reveal mt-9" style={{ animationDelay: "300ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            {t.withdrawals}{" "}
            <span className="text-muted">({withdrawals.length})</span>
          </h2>
          {pending.length > 0 && (
            <span className="badge badge-success">
              {format(t.pendingPayouts, {
                n: pending.length,
                amount: pendingTotal,
              })}
            </span>
          )}
        </div>
        <AdminSearchBox value={query} onChange={setQuery} placeholder={t.searchWithdrawals} />
      </div>

      {filtered.length === 0 ? (
        <div className="card mt-3 flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface-strong text-faint">
            <Banknote size={20} />
          </span>
          <p className="text-sm text-muted">
            {withdrawals.length === 0 ? t.noWithdrawals : t.noResults}
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {filtered.map((w) => (
            <WithdrawalCard key={w.id} w={w} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function WithdrawalCard({ w, t }: { w: AdminWithdrawalView; t: AdminDict }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {w.avatar ? (
            <Image
              src={`https://cdn.discordapp.com/avatars/${w.userDiscordId}/${w.avatar}.png`}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-full ring-1 ring-border"
            />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
              {w.userName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{w.userName}</p>
            <p className="truncate font-mono text-xs text-faint">
              {w.userDiscordId}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-semibold tabular-nums leading-none">
            {w.amount}
          </p>
          <span className={`${W_STATUS_BADGE[w.status] ?? "badge"} mt-1.5`}>
            {withdrawalStatusLabel(w.status, t)}
          </span>
        </div>
      </div>

      <div className="sunken mt-3 whitespace-pre-wrap break-words p-3 text-xs text-muted">
        {w.payoutDetails}
      </div>
      {w.note && (
        <p className="mt-2 text-xs text-muted">
          <span className="text-faint">{t.devNoteLabel}: </span>
          {w.note}
        </p>
      )}

      <p className="mt-2 text-xs text-faint">
        {format(t.requestedOn, { date: w.requested })}
        {w.processed && ` - ${format(t.processedOn, { date: w.processed })}`}
      </p>

      {w.status === "pending" ? (
        <form className="mt-3 space-y-2">
          <input type="hidden" name="id" value={w.id} />
          <input
            className="input !py-2 text-sm"
            name="adminNote"
            aria-label={t.adminNotePlaceholder}
            placeholder={t.adminNotePlaceholder}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              formAction={markWithdrawalPaid}
              className="btn btn-primary !py-1.5 text-xs"
            >
              {t.markPaid}
            </button>
            <button
              type="submit"
              formAction={rejectWithdrawal}
              onClick={(e) => {
                if (!confirm(t.rejectConfirm)) e.preventDefault();
              }}
              className="btn btn-ghost !py-1.5 text-xs"
            >
              {t.reject}
            </button>
          </div>
        </form>
      ) : (
        w.adminNote && (
          <p className="mt-3 text-xs text-muted">
            <span className="text-faint">{t.adminNotePlaceholder}: </span>
            {w.adminNote}
          </p>
        )
      )}
    </div>
  );
}
