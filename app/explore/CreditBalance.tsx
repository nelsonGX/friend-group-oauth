"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Modal } from "@/components/Modal";

export interface Activity {
  id: string;
  time: string;
  label: string;
  delta: number;
}

/**
 * The credit balance, doubled as the entry point to the activity log: clicking
 * it opens a popup with the recent ledger entries instead of spelling the whole
 * table out on the page.
 */
export function CreditBalance({
  balance,
  entries,
  t,
}: {
  balance: number;
  entries: Activity[];
  t: {
    creditBalance: string;
    credits: string;
    recentActivity: string;
    noTransactions: string;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mr-2.5 flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-surface-strong"
      >
        <span>
          <span className="block text-xs uppercase tracking-wide text-faint">
            {t.creditBalance}
          </span>
          <span className="block text-2xl font-semibold leading-tight tabular-nums">
            <span className="shimmer-text">{balance}</span>
            <span className="ml-1.5 text-sm font-normal text-faint">
              {t.credits}
            </span>
          </span>
        </span>
        <History size={16} className="shrink-0 text-faint" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t.recentActivity}
        size="lg"
      >
        {entries.length === 0 ? (
          <p className="text-sm text-muted">{t.noTransactions}</p>
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
                <span className="min-w-0 flex-1 break-words text-muted">
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
