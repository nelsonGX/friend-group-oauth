"use client";

import { useMemo, useState } from "react";
import { AdminSearchBox } from "./AdminSearchBox";
import { toggleClientActive, toggleClientTrusted } from "./actions";
import type { AdminProviderRow } from "./AdminTypes";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type AdminDict = Dictionary["admin"];

export function ProvidersSection({
  providers,
  t,
}: {
  providers: AdminProviderRow[];
  t: AdminDict;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.clientId.toLowerCase().includes(q),
    );
  }, [providers, query]);

  return (
    <section className="reveal mt-9" style={{ animationDelay: "240ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          {t.providers} <span className="text-muted">({providers.length})</span>
        </h2>
        <AdminSearchBox value={query} onChange={setQuery} placeholder={t.searchProviders} />
      </div>
      <div className="card card-hover-border mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="p-4 font-medium">{t.th.name}</th>
              <th className="p-4 font-medium">{t.th.clientId}</th>
              <th className="p-4 font-medium">{t.th.scopes}</th>
              <th className="p-4 text-right font-medium">{t.th.earned}</th>
              <th className="p-4 font-medium">{t.th.status}</th>
              <th className="p-4 text-right font-medium">{t.th.actions}</th>
            </tr>
          </thead>
          <tbody className="glass-divide">
            {filtered.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-surface-strong">
                <td className="p-4 font-medium">{c.name}</td>
                <td className="p-4 font-mono text-xs text-muted">{c.clientId}</td>
                <td className="p-4 text-muted">{c.scopes.join(", ")}</td>
                <td className="p-4 text-right tabular-nums">{c.earned}</td>
                <td className="p-4">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`badge ${c.isActive ? "badge-success" : "badge-danger"}`}>
                      {c.isActive ? t.active : t.disabled}
                    </span>
                    {c.trusted && <span className="badge">{t.trusted}</span>}
                    {c.listed && <span className="badge">{t.listed}</span>}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <form action={toggleClientActive}>
                      <input type="hidden" name="clientId" value={c.clientId} />
                      <button type="submit" className="btn btn-ghost px-2.5! py-1.5! text-xs">
                        {c.isActive ? t.disable : t.enable}
                      </button>
                    </form>
                    <form action={toggleClientTrusted}>
                      <input type="hidden" name="clientId" value={c.clientId} />
                      <button type="submit" className="btn btn-ghost px-2.5! py-1.5! text-xs">
                        {c.trusted ? t.untrust : t.trust}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted">
                  {providers.length === 0 ? t.noProviders : t.noResults}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
