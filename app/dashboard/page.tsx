import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getBalance, getLedger, getProviderEarnings } from "@/lib/credits";
import { env } from "@/lib/env";
import { revokeAppAccess } from "./actions";
import { AppSetup, NewAppForm } from "./DashboardForms";

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/dashboard");

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
              {user.allowed ? "Access granted" : "No access — check your role"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin && (
            <Link href="/admin" className="btn btn-ghost !py-2 text-sm">
              Admin
            </Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-ghost !py-2 text-sm">Log out</button>
          </form>
        </div>
      </div>

      {/* desktop: sidebar (balance + connected) | main (provider + activity) */}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-3">
        {/* sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-20">
          {/* balance hero */}
          <section
            className="reveal card card-hover relative overflow-hidden p-6"
            style={{ animationDelay: "80ms" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand/25 blur-3xl"
            />
            <p className="text-sm text-muted">Credit balance</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight">
              <span className="shimmer-text">{balance}</span>
              <span className="ml-2 align-middle text-base font-normal text-faint">
                credits
              </span>
            </p>
          </section>

          {/* connected apps */}
          <section className="reveal" style={{ animationDelay: "140ms" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
              Connected apps
            </h2>
            {connected.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No apps connected yet.</p>
            ) : (
              <ul className="card card-hover mt-3 glass-divide overflow-hidden">
                {connected.map((c) => (
                  <li
                    key={c.clientId}
                    className="flex items-center justify-between p-4 transition-colors hover:bg-surface-strong"
                  >
                    <span className="text-sm font-medium">
                      {c.name ?? c.clientId}
                    </span>
                    <form action={revokeAppAccess}>
                      <input type="hidden" name="clientId" value={c.clientId} />
                      <button className="text-sm text-danger transition-opacity hover:opacity-80">
                        Revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        {/* main column */}
        <div className="space-y-9 lg:col-span-2">
          {/* provider apps */}
          <section className="reveal" style={{ animationDelay: "200ms" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
              Provider apps
            </h2>
            <p className="mt-2 text-sm text-muted">
              Building a site for the group? Register it as an OAuth app to log
              members in and charge credits.
            </p>

            {owned.length > 0 && (
              <ul className="mt-4 space-y-3">
                {owned.map((c, i) => (
                  <li key={c.id} className="card card-hover p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="badge">{ownedEarnings[i]} earned</span>
                        {!c.isActive && (
                          <span className="badge badge-danger">disabled</span>
                        )}
                        {c.trusted && (
                          <span className="badge badge-success">trusted</span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 font-mono text-xs text-faint">
                      {c.clientId}
                    </p>
                    <AppSetup
                      appUrl={appUrl}
                      clientId={c.clientId}
                      scopes={c.allowedScopes}
                      redirectUris={c.redirectUris}
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="card mt-4 p-5">
              <h3 className="text-sm font-semibold">Register a new app</h3>
              {canRegister ? (
                <div className="mt-3">
                  <NewAppForm />
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  You need access (server membership + role) before you can
                  register an app.
                </p>
              )}
            </div>
          </section>

          {/* activity */}
          <section className="reveal" style={{ animationDelay: "260ms" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
              Recent activity
            </h2>
            {entries.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No transactions yet.</p>
            ) : (
              <div className="card card-hover mt-3 overflow-hidden">
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
                          {e.reason ?? (e.delta > 0 ? "Top-up" : "Charge")}
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
        </div>
      </div>
    </main>
  );
}
