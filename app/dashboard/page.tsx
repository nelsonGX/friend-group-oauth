import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, LogOut, Link2, Boxes } from "lucide-react";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { getBalance, getLedger, getProviderEarnings } from "@/lib/credits";
import { SUPPORTED_SCOPES } from "@/lib/oauth";
import { env } from "@/lib/env";
import { ProviderApps } from "./ProviderApps";
import { ConnectedApps } from "./ConnectedApps";
import type { AppView } from "./AppDetailsModal";

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/dashboard");

  const { t } = await getDictionary();
  const db = getDb();
  const balance = await getBalance(user.id);
  const entries = await getLedger(user.id, 25);

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

  const owned = await db.select().from(clients).where(eq(clients.ownerUserId, user.id));
  const ownedEarnings = await Promise.all(owned.map((c) => getProviderEarnings(c.id)));
  const canRegister = user.allowed || user.isAdmin;
  const appUrl = env.APP_URL;

  // Serialize owned apps for the client components (Dates aren't passable as-is).
  const appViews: AppView[] = owned.map((c, i) => ({
    id: c.id,
    name: c.name,
    clientId: c.clientId,
    allowedScopes: c.allowedScopes,
    redirectUris: c.redirectUris,
    isActive: c.isActive,
    trusted: c.trusted,
    earned: ownedEarnings[i],
    webhookUrl: c.webhookUrl,
    createdAt: c.createdAt.toISOString(),
  }));

  const stats = [
    { icon: Link2, label: t.dashboard.statConnected, value: connected.length },
    { icon: Boxes, label: t.dashboard.statOwned, value: owned.length },
  ];

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
            <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-soft to-violet text-lg font-semibold text-white">
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
              {user.allowed ? t.dashboard.accessGranted : t.dashboard.noAccess}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin && (
            <Link href="/admin" className="btn btn-ghost !py-2 text-sm">
              <Shield size={15} />
              {t.dashboard.admin}
            </Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-ghost !py-2 text-sm">
              <LogOut size={15} />
              {t.dashboard.logout}
            </button>
          </form>
        </div>
      </div>

      {/* stats row */}
      <div
        className="reveal mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        style={{ animationDelay: "80ms" }}
      >
        <section className="card relative overflow-hidden p-6 sm:col-span-2 lg:col-span-1">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand/25 blur-3xl"
          />
          <p className="text-sm text-muted">{t.dashboard.creditBalance}</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">
            <span className="shimmer-text">{balance}</span>
            <span className="ml-2 align-middle text-base font-normal text-faint">
              {t.dashboard.credits}
            </span>
          </p>
        </section>
        {stats.map(({ icon: Icon, label, value }) => (
          <section key={label} className="card flex items-center gap-4 p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-strong text-brand-soft">
              <Icon size={20} />
            </span>
            <div>
              <p className="text-3xl font-semibold tabular-nums leading-none">{value}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </div>
          </section>
        ))}
      </div>

      {/* your apps | connected */}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-3">
        <div className="reveal lg:col-span-2" style={{ animationDelay: "140ms" }}>
          <ProviderApps
            apps={appViews}
            appUrl={appUrl}
            canRegister={canRegister}
            supportedScopes={[...SUPPORTED_SCOPES]}
            scopeInfo={t.authorize.scopes}
            t={t.dashboard}
          />
        </div>

        <aside className="reveal lg:sticky lg:top-20" style={{ animationDelay: "200ms" }}>
          <ConnectedApps
            apps={connected.map((c) => ({ clientId: c.clientId, name: c.name }))}
            t={t.dashboard}
          />
        </aside>
      </div>

      {/* activity */}
      <section className="reveal mt-10" style={{ animationDelay: "260ms" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          {t.dashboard.recentActivity}
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t.dashboard.noTransactions}</p>
        ) : (
          <div className="card mt-3 overflow-hidden">
            <table className="w-full text-left text-sm">
              <tbody className="glass-divide">
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="transition-colors hover:bg-surface-strong"
                  >
                    <td className="p-4 font-mono text-xs text-faint">
                      {fmt(e.createdAt)}
                    </td>
                    <td className="p-4 text-muted">
                      {e.reason ?? (e.delta > 0 ? t.dashboard.topUp : t.dashboard.charge)}
                    </td>
                    <td
                      className={`p-4 text-right font-medium tabular-nums ${
                        e.delta > 0 ? "text-success" : "text-ink"
                      }`}
                    >
                      {e.delta > 0 ? `+${e.delta}` : e.delta}
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
