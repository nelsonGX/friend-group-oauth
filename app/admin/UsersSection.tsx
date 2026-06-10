"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { AdminSearchBox } from "./AdminSearchBox";
import { UserHistory } from "./UserHistory";
import type { AdminUserRow } from "./AdminTypes";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type AdminDict = Dictionary["admin"];

export function UsersSection({
  users,
  onGrant,
  t,
}: {
  users: AdminUserRow[];
  onGrant: (discordId: string) => void;
  t: AdminDict;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.discordId.toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <section className="reveal mt-9" style={{ animationDelay: "360ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          {t.users} <span className="text-muted">({users.length})</span>
        </h2>
        <AdminSearchBox value={query} onChange={setQuery} placeholder={t.searchUsers} />
      </div>
      <div className="card card-hover-border mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="p-4 font-medium">{t.th.user}</th>
              <th className="p-4 font-medium">{t.th.discordId}</th>
              <th className="p-4 font-medium">{t.th.access}</th>
              <th className="p-4 text-right font-medium">{t.th.balance}</th>
              <th className="p-4 text-right font-medium">{t.th.actions}</th>
            </tr>
          </thead>
          <tbody className="glass-divide">
            {filtered.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-surface-strong">
                <td className="p-4">
                  <div className="flex items-center gap-2.5">
                    {u.avatar ? (
                      <Image
                        src={`https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png`}
                        alt=""
                        width={28}
                        height={28}
                        className="h-7 w-7 shrink-0 rounded-full ring-1 ring-border"
                      />
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
                        {u.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="font-medium">{u.name}</span>
                    {u.isAdmin && <span className="badge">{t.adminBadge}</span>}
                    {u.isSelf && <span className="badge badge-success">{t.you}</span>}
                  </div>
                </td>
                <td className="p-4 font-mono text-xs text-muted">{u.discordId}</td>
                <td className="p-4">
                  <span className={`badge ${u.allowed ? "badge-success" : "badge-danger"}`}>
                    {u.allowed ? t.allowed : t.noAccessBadge}
                  </span>
                </td>
                <td className="p-4 text-right tabular-nums">{u.balance}</td>
                <td className="p-4">
                  <div className="flex justify-end gap-1.5">
                    <UserHistory discordId={u.discordId} name={u.name} t={t} />
                    <button
                      type="button"
                      onClick={() => onGrant(u.discordId)}
                      className="btn btn-ghost px-2.5! py-1.5! text-xs"
                    >
                      <Coins size={13} />
                      {t.grant}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  {t.noResults}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
