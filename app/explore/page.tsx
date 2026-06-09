import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Boxes,
  Compass,
  ExternalLink,
  Link2,
  LogOut,
  Shield,
  Wallet,
} from "lucide-react";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { getBalance, getLedger } from "@/lib/credits";
import { ConnectedApps } from "../dashboard/ConnectedApps";

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * The user-facing home: a member's credit balance, the apps they've connected,
 * the public directory of group apps they can use, and their recent activity.
 * App-building/management lives separately in the developer panel (/dashboard).
 */
export default async function ExplorePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/explore");

  const { t } = await getDictionary();
  const db = getDb();
  const balance = await getBalance(user.id);
  const entries = await getLedger(user.id, 25);

  // Apps the user has authorized (live tokens), with display names.
  const connected = await db
    .selectDistinct({ clientId: accessTokens.clientId, name: clients.name })
    .from(accessTokens)
    .leftJoin(clients, eq(clients.clientId, accessTokens.clientId))
    .where(
      and(
        eq(accessTokens.userId, user.id),
        eq(accessTokens.revoked, false),
        gt(accessTokens.expiresAt, new Date()),
      ),
    );
  const connectedIds = new Set(connected.map((c) => c.clientId));

  // The opted-in, active directory listings.
  const listed = await db
    .select()
    .from(clients)
    .where(and(eq(clients.listed, true), eq(clients.isActive, true)))
    .orderBy(asc(clients.name));

  const d = t.dashboard;
  const e = t.explore;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      {/* identity + actions */}
      <div
        className="reveal flex flex-wrap items-center justify-between gap-4"
        style={{ animationDelay: "0ms" }}
      >
        <div className="flex items-center gap-3.5">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
              alt=""
              className="h-12 w-12 rounded-full ring-2 ring-border"
            />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-lg font-semibold text-white">
              {(user.globalName ?? user.username).slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-xl font-semibold leading-tight">
              {user.globalName ?? user.username}
            </h1>
            <span
              className={`badge mt-1 ${user.allowed ? "badge-success" : "badge-danger"}`}
            >
              <span className="dot" />
              {user.allowed ? d.accessGranted : d.noAccess}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn btn-ghost !py-2 text-sm">
            <Boxes size={15} />
            {t.nav.dashboard}
          </Link>
          {user.isAdmin && (
            <Link href="/admin" className="btn btn-ghost !py-2 text-sm">
              <Shield size={15} />
              {d.admin}
            </Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-ghost !py-2 text-sm">
              <LogOut size={15} />
              {d.logout}
            </button>
          </form>
        </div>
      </div>

      {/* stats row */}
      <div
        className="reveal mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        style={{ animationDelay: "60ms" }}
      >
        <section className="card card-hover p-6 sm:col-span-2 lg:col-span-1">
          <p className="text-sm text-muted">{d.creditBalance}</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">
            <span className="shimmer-text">{balance}</span>
            <span className="ml-2 align-middle text-base font-normal text-faint">
              {d.credits}
            </span>
          </p>
        </section>
        <section className="card card-hover flex items-center gap-4 p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-strong text-brand-soft">
            <Link2 size={20} />
          </span>
          <div>
            <p className="text-3xl font-semibold tabular-nums leading-none">
              {connected.length}
            </p>
            <p className="mt-1 text-sm text-muted">{d.statConnected}</p>
          </div>
        </section>
        <section className="card card-hover flex items-center gap-4 p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-strong text-brand-soft">
            <Wallet size={20} />
          </span>
          <div>
            <p className="text-3xl font-semibold tabular-nums leading-none">
              {listed.length}
            </p>
            <p className="mt-1 text-sm text-muted">{e.heading}</p>
          </div>
        </section>
      </div>

      {/* directory | connected */}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-3">
        <section className="reveal lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center gap-2.5">
            <Compass size={18} className="text-brand-soft" />
            <h2 className="text-lg font-semibold">{e.heading}</h2>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">{e.subtitle}</p>

          {listed.length === 0 ? (
            <div className="card card-hover mt-4 flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-strong text-faint">
                <Boxes size={22} />
              </span>
              <div>
                <p className="font-medium">{e.emptyTitle}</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{e.emptyDesc}</p>
              </div>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {listed.map((app) => {
                const title = app.displayTitle ?? app.name;
                return (
                  <li key={app.id} className="card card-hover-border flex flex-col p-5">
                    <div className="flex items-start gap-3">
                      {app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={app.iconUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-border"
                        />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-lg font-semibold text-white">
                          {title.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 break-words font-medium leading-tight">
                            {title}
                          </h3>
                          {connectedIds.has(app.clientId) && (
                            <span className="badge badge-success shrink-0">
                              <span className="dot" />
                              {e.connected}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {app.description && (
                      <p className="mt-3 text-sm leading-relaxed text-muted">
                        {app.description}
                      </p>
                    )}

                    {app.websiteUrl && (
                      <div className="mt-4 flex justify-end border-t border-border pt-3">
                        <a
                          href={app.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary !py-1.5 text-sm"
                        >
                          <ExternalLink size={15} />
                          {e.visit}
                        </a>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="reveal lg:sticky lg:top-20" style={{ animationDelay: "180ms" }}>
          <ConnectedApps
            apps={connected.map((c) => ({ clientId: c.clientId, name: c.name }))}
            t={d}
          />
        </aside>
      </div>

      {/* activity */}
      <section className="reveal mt-10" style={{ animationDelay: "240ms" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          {d.recentActivity}
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{d.noTransactions}</p>
        ) : (
          <div className="card card-hover mt-3 overflow-hidden">
            <table className="w-full text-left text-sm">
              <tbody className="glass-divide">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="transition-colors hover:bg-surface-strong"
                  >
                    <td className="p-4 font-mono text-xs text-faint">
                      {fmt(entry.createdAt)}
                    </td>
                    <td className="p-4 text-muted">
                      {entry.reason ??
                        (entry.delta > 0 ? d.topUp : d.charge)}
                    </td>
                    <td
                      className={`p-4 text-right font-medium tabular-nums ${
                        entry.delta > 0 ? "text-success" : "text-ink"
                      }`}
                    >
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
