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
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {user.avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
              alt=""
              className="h-10 w-10 rounded-full"
            />
          )}
          <div>
            <h1 className="text-xl font-semibold">{user.globalName ?? user.username}</h1>
            <p className="text-sm opacity-70">
              {user.allowed ? "Access granted" : "No access — check your server role"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user.isAdmin && (
            <Link href="/admin" className="underline opacity-70 hover:opacity-100">
              Admin
            </Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button className="underline opacity-70 hover:opacity-100">Log out</button>
          </form>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-black/10 dark:border-white/15 p-5">
        <p className="text-sm opacity-70">Credit balance</p>
        <p className="mt-1 text-3xl font-semibold">{balance}</p>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Connected apps</h2>
        {connected.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">No apps connected yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10 rounded-xl border border-black/10 dark:border-white/15">
            {connected.map((c) => (
              <li key={c.clientId} className="flex items-center justify-between p-3">
                <span className="text-sm font-medium">{c.name ?? c.clientId}</span>
                <form action={revokeAppAccess}>
                  <input type="hidden" name="clientId" value={c.clientId} />
                  <button className="text-sm text-red-600 underline dark:text-red-400">
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Provider apps</h2>
        <p className="mt-1 text-sm opacity-70">
          Building a site for the group? Register it as an OAuth app to log
          members in and charge credits.
        </p>

        {owned.length > 0 && (
          <ul className="mt-3 space-y-3">
            {owned.map((c, i) => (
              <li
                key={c.id}
                className="rounded-xl border border-black/10 dark:border-white/15 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-sm opacity-70">
                    {ownedEarnings[i]} credits earned
                    {c.isActive ? "" : " · disabled"}
                    {c.trusted ? " · trusted" : ""}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs opacity-70">{c.clientId}</p>
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

        <div className="mt-4 rounded-xl border border-black/10 dark:border-white/15 p-4">
          <h3 className="text-sm font-semibold">Register a new app</h3>
          {canRegister ? (
            <div className="mt-3">
              <NewAppForm />
            </div>
          ) : (
            <p className="mt-2 text-sm opacity-60">
              You need access (server membership + role) before you can register
              an app.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Recent activity</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">No transactions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
            <table className="w-full text-left text-sm">
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-black/5 dark:border-white/10">
                    <td className="p-3 opacity-60">{fmt(e.createdAt)}</td>
                    <td className="p-3">{e.reason ?? (e.delta > 0 ? "Top-up" : "Charge")}</td>
                    <td
                      className={`p-3 text-right font-medium ${
                        e.delta > 0 ? "text-green-600 dark:text-green-400" : ""
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
