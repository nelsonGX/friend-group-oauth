"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Modal } from "@/components/Modal";
import { fetchUserHistory, type UserHistoryEntry } from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type AdminDict = Dictionary["admin"];

type Status = "idle" | "loading" | "error" | "ready";

/**
 * Per-user "view full balance history" control: a button that lazily loads the
 * member's whole ledger (admin-gated server action) and shows it in a popup, so
 * the admin table doesn't pay to fetch every user's transactions up front.
 */
export function UserHistory({
  discordId,
  name,
  t,
}: {
  discordId: string;
  name: string;
  t: AdminDict;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [entries, setEntries] = useState<UserHistoryEntry[]>([]);
  const [balance, setBalance] = useState(0);

  async function load() {
    setOpen(true);
    setStatus("loading");
    const res = await fetchUserHistory(discordId);
    if (res.ok) {
      setEntries(res.entries);
      setBalance(res.balance);
      setStatus("ready");
    } else {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={load}
        className="btn btn-ghost px-2.5! py-1.5! text-xs"
      >
        <History size={13} />
        {t.history}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.historyTitle}
        description={
          status === "ready"
            ? `${name} · ${t.th.balance}: ${balance}`
            : name
        }
        size="lg"
      >
        {status === "loading" ? (
          <p className="py-10 text-center text-sm text-muted">{t.historyLoading}</p>
        ) : status === "error" ? (
          <p className="py-10 text-center text-sm text-danger">{t.historyError}</p>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t.historyEmpty}</p>
        ) : (
          // Full-bleed rows: cancel the modal body's padding so each row spans
          // edge to edge (aligning with the header divider) and carries its own.
          <ul className="-mx-6 -my-5 glass-divide">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-4 px-6 py-3 text-sm transition-colors hover:bg-surface-strong"
              >
                <span className="shrink-0 font-mono text-xs text-faint">
                  {entry.time}
                </span>
                <span className="min-w-0 flex-1 wrap-break-word text-muted">
                  {entry.label}
                </span>
                <span
                  className={`shrink-0 font-medium tabular-nums ${
                    entry.delta > 0 ? "text-success" : "text-ink"
                  }`}
                >
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
