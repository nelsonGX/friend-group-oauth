"use client";

import { useMemo, useState } from "react";
import { AdminSearchBox } from "./AdminSearchBox";
import { toggleRedeemCodeActive } from "./actions";
import type { AdminRedeemRow } from "./AdminTypes";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type AdminDict = Dictionary["admin"];

export function RedeemCodesSection({
  redeemCodes,
  t,
}: {
  redeemCodes: AdminRedeemRow[];
  t: AdminDict;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return redeemCodes;
    return redeemCodes.filter((c) => c.code.toLowerCase().includes(q));
  }, [redeemCodes, query]);

  return (
    <section className="reveal mt-9" style={{ animationDelay: "270ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          {t.redeemCodes} <span className="text-muted">({redeemCodes.length})</span>
        </h2>
        <AdminSearchBox value={query} onChange={setQuery} placeholder={t.searchRedeemCodes} />
      </div>
      <div className="card card-hover-border mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="p-4 font-medium">{t.th.code}</th>
              <th className="p-4 text-right font-medium">{t.th.amount}</th>
              <th className="p-4 text-right font-medium">{t.th.uses}</th>
              <th className="p-4 font-medium">{t.th.expires}</th>
              <th className="p-4 font-medium">{t.th.status}</th>
              <th className="p-4 text-right font-medium">{t.th.actions}</th>
            </tr>
          </thead>
          <tbody className="glass-divide">
            {filtered.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-surface-strong">
                <td className="p-4 font-mono text-xs tracking-wide">{c.code}</td>
                <td className="p-4 text-right tabular-nums">{c.amount}</td>
                <td className="p-4 text-right tabular-nums text-muted">
                  {c.redemptionCount}
                  {" / "}
                  {c.maxRedemptions ?? t.unlimited}
                </td>
                <td className="p-4 text-muted">{c.expires ?? t.never}</td>
                <td className="p-4">
                  <span
                    className={`badge ${c.active && !c.expired ? "badge-success" : "badge-danger"}`}
                  >
                    {c.expired ? t.disabled : c.active ? t.active : t.disabled}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex justify-end">
                    <form action={toggleRedeemCodeActive}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
                        {c.active ? t.disable : t.enable}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted">
                  {redeemCodes.length === 0 ? t.noRedeemCodes : t.noResults}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
