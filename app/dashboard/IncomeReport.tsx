"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type IncomeDict = Dictionary["dashboard"]["income"];

export interface IncomeRow {
  id: string;
  /** Pre-formatted on the server — Dates aren't passable to client components. */
  date: string;
  appName: string | null;
  reason: string | null;
  fromName: string | null;
  amount: number;
}

/** How many rows to show before the "Show all" toggle reveals the rest. */
const PREVIEW = 6;

/**
 * Income for the developer's apps. Secondary to the apps grid, so it shows just
 * the most recent few payments by default and expands to the full list on
 * demand rather than dumping a long table on the page.
 */
export function IncomeReport({ entries, t }: { entries: IncomeRow[]; t: IncomeDict }) {
  const [expanded, setExpanded] = useState(false);

  const hasMore = entries.length > PREVIEW;
  const rows = expanded ? entries : entries.slice(0, PREVIEW);

  return (
    <section>
      <div className="flex items-center gap-2.5">
        <Coins size={18} className="text-brand-soft" />
        <h2 className="text-lg font-semibold">{t.heading}</h2>
      </div>
      <p className="mt-1 max-w-xl text-sm text-muted">{t.desc}</p>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t.empty}</p>
      ) : (
        <>
          <div className="card card-hover mt-4 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-faint">
                  <th className="p-4 font-medium">{t.thDate}</th>
                  <th className="p-4 font-medium">{t.thApp}</th>
                  <th className="p-4 font-medium">{t.thFrom}</th>
                  <th className="p-4 text-right font-medium">{t.thAmount}</th>
                </tr>
              </thead>
              <tbody className="glass-divide">
                {rows.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition-colors hover:bg-surface-strong"
                  >
                    <td className="p-4 font-mono text-xs text-faint">{entry.date}</td>
                    <td className="p-4">
                      <span className="font-medium">
                        {entry.appName ?? t.unknownApp}
                      </span>
                      {entry.reason && (
                        <span className="block text-xs text-muted">{entry.reason}</span>
                      )}
                    </td>
                    <td className="p-4 text-muted">{entry.fromName ?? t.unknownFrom}</td>
                    <td className="p-4 text-right font-medium tabular-nums text-success">
                      +{entry.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="link mt-3 text-sm"
            >
              {expanded ? t.showLess : format(t.showAll, { n: entries.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}
