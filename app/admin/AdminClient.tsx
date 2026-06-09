"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Coins } from "lucide-react";
import { GrantCreditsForm, NewClientForm, NewRedeemCodeForm } from "./AdminForms";
import {
  toggleClientActive,
  toggleClientTrusted,
  toggleRedeemCodeActive,
} from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export interface AdminUserRow {
  id: string;
  discordId: string;
  name: string;
  avatar: string | null;
  isAdmin: boolean;
  allowed: boolean;
  balance: number;
  isSelf: boolean;
}

export interface AdminProviderRow {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  earned: number;
  isActive: boolean;
  trusted: boolean;
  listed: boolean;
}

export interface AdminRedeemRow {
  id: string;
  code: string;
  amount: number;
  redemptionCount: number;
  maxRedemptions: number | null;
  expires: string | null;
  expired: boolean;
  active: boolean;
}

type AdminDict = Dictionary["admin"];

/**
 * Interactive admin surface: the two action forms, plus searchable providers
 * and users tables. The grant form's target Discord ID is lifted here so a
 * "Grant" button on any user row can prefill it and scroll it into view.
 */
export function AdminClient({
  users,
  providers,
  redeemCodes,
  t,
}: {
  users: AdminUserRow[];
  providers: AdminProviderRow[];
  redeemCodes: AdminRedeemRow[];
  t: AdminDict;
}) {
  const [grantId, setGrantId] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const grantRef = useRef<HTMLDivElement>(null);

  const filteredCodes = useMemo(() => {
    const q = codeQuery.trim().toLowerCase();
    if (!q) return redeemCodes;
    return redeemCodes.filter((c) => c.code.toLowerCase().includes(q));
  }, [redeemCodes, codeQuery]);

  const filteredProviders = useMemo(() => {
    const q = providerQuery.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.clientId.toLowerCase().includes(q),
    );
  }, [providers, providerQuery]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.discordId.toLowerCase().includes(q),
    );
  }, [users, userQuery]);

  function targetUser(discordId: string) {
    setGrantId(discordId);
    grantRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <section
          ref={grantRef}
          className="reveal card card-hover-border p-6"
          style={{ animationDelay: "120ms" }}
        >
          <h2 className="font-semibold">{t.grantCredits}</h2>
          <p className="mb-4 mt-1 text-sm text-muted">{t.grantCreditsDesc}</p>
          <GrantCreditsForm
            t={t.forms}
            discordId={grantId}
            onDiscordIdChange={setGrantId}
          />
        </section>

        <section
          className="reveal card card-hover-border p-6"
          style={{ animationDelay: "180ms" }}
        >
          <h2 className="font-semibold">{t.registerProvider}</h2>
          <p className="mb-4 mt-1 text-sm text-muted">{t.registerProviderDesc}</p>
          <NewClientForm t={t.forms} />
        </section>

        <section
          className="reveal card card-hover-border p-6"
          style={{ animationDelay: "240ms" }}
        >
          <h2 className="font-semibold">{t.createRedeemCode}</h2>
          <p className="mb-4 mt-1 text-sm text-muted">{t.createRedeemCodeDesc}</p>
          <NewRedeemCodeForm t={t.forms} />
        </section>
      </div>

      {/* providers */}
      <section className="reveal mt-9" style={{ animationDelay: "240ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            {t.providers} <span className="text-muted">({providers.length})</span>
          </h2>
          <SearchBox
            value={providerQuery}
            onChange={setProviderQuery}
            placeholder={t.searchProviders}
          />
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
              {filteredProviders.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-strong">
                  <td className="p-4 font-medium">{c.name}</td>
                  <td className="p-4 font-mono text-xs text-muted">{c.clientId}</td>
                  <td className="p-4 text-muted">{c.scopes.join(", ")}</td>
                  <td className="p-4 text-right tabular-nums">{c.earned}</td>
                  <td className="p-4">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`badge ${c.isActive ? "badge-success" : "badge-danger"}`}
                      >
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
                        <button className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
                          {c.isActive ? t.disable : t.enable}
                        </button>
                      </form>
                      <form action={toggleClientTrusted}>
                        <input type="hidden" name="clientId" value={c.clientId} />
                        <button className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
                          {c.trusted ? t.untrust : t.trust}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProviders.length === 0 && (
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

      {/* redeem codes */}
      <section className="reveal mt-9" style={{ animationDelay: "270ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            {t.redeemCodes} <span className="text-muted">({redeemCodes.length})</span>
          </h2>
          <SearchBox
            value={codeQuery}
            onChange={setCodeQuery}
            placeholder={t.searchRedeemCodes}
          />
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
              {filteredCodes.map((c) => (
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
                        <button className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
                          {c.active ? t.disable : t.enable}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCodes.length === 0 && (
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

      {/* users */}
      <section className="reveal mt-9" style={{ animationDelay: "330ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            {t.users} <span className="text-muted">({users.length})</span>
          </h2>
          <SearchBox
            value={userQuery}
            onChange={setUserQuery}
            placeholder={t.searchUsers}
          />
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
              {filteredUsers.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-surface-strong">
                  <td className="p-4">
                    <div className="flex items-center gap-2.5">
                      {u.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png`}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded-full ring-1 ring-border"
                        />
                      ) : (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
                          {u.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="font-medium">{u.name}</span>
                      {u.isAdmin && (
                        <span className="badge">{t.adminBadge}</span>
                      )}
                      {u.isSelf && (
                        <span className="badge badge-success">{t.you}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 font-mono text-xs text-muted">{u.discordId}</td>
                  <td className="p-4">
                    <span
                      className={`badge ${u.allowed ? "badge-success" : "badge-danger"}`}
                    >
                      {u.allowed ? t.allowed : t.noAccessBadge}
                    </span>
                  </td>
                  <td className="p-4 text-right tabular-nums">{u.balance}</td>
                  <td className="p-4">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => targetUser(u.discordId)}
                        className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
                      >
                        <Coins size={13} />
                        {t.grant}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
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
    </>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:w-64">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        className="input !py-2 !pl-9 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
