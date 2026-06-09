import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { getBalance, getProviderEarnings } from "@/lib/credits";
import { GrantCreditsForm, NewClientForm } from "./AdminForms";
import { toggleClientActive, toggleClientTrusted } from "./actions";

export default async function AdminPage() {
  await requireAdmin();
  const db = getDb();

  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const balances = await Promise.all(allUsers.map((u) => getBalance(u.id)));
  const allClients = await db.select().from(clients).orderBy(desc(clients.createdAt));
  const earnings = await Promise.all(allClients.map((c) => getProviderEarnings(c.id)));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <Link href="/dashboard" className="text-sm underline opacity-70 hover:opacity-100">
          Back to dashboard
        </Link>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-black/10 dark:border-white/15 p-5">
          <h2 className="font-semibold">Grant credits</h2>
          <p className="mb-3 mt-1 text-sm opacity-70">
            Manual top-up after a user pays you out-of-band.
          </p>
          <GrantCreditsForm />
        </section>

        <section className="rounded-xl border border-black/10 dark:border-white/15 p-5">
          <h2 className="font-semibold">Register a provider</h2>
          <p className="mb-3 mt-1 text-sm opacity-70">
            Create OAuth credentials for a friend&apos;s site.
          </p>
          <NewClientForm />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="font-semibold">Providers ({allClients.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/15 text-xs uppercase opacity-60">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">client_id</th>
                <th className="p-3">Scopes</th>
                <th className="p-3">Earned</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allClients.map((c, i) => (
                <tr key={c.id} className="border-b border-black/5 dark:border-white/10">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 font-mono text-xs">{c.clientId}</td>
                  <td className="p-3">{c.allowedScopes.join(", ")}</td>
                  <td className="p-3">{earnings[i]}</td>
                  <td className="p-3">
                    {c.isActive ? "active" : "disabled"}
                    {c.trusted && <span className="opacity-60"> · trusted</span>}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <form action={toggleClientActive}>
                        <input type="hidden" name="clientId" value={c.clientId} />
                        <button className="underline opacity-70 hover:opacity-100">
                          {c.isActive ? "disable" : "enable"}
                        </button>
                      </form>
                      <form action={toggleClientTrusted}>
                        <input type="hidden" name="clientId" value={c.clientId} />
                        <button className="underline opacity-70 hover:opacity-100">
                          {c.trusted ? "untrust" : "trust"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {allClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center opacity-60">
                    No providers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Users ({allUsers.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/15 text-xs uppercase opacity-60">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Discord ID</th>
                <th className="p-3">Access</th>
                <th className="p-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u, i) => (
                <tr key={u.id} className="border-b border-black/5 dark:border-white/10">
                  <td className="p-3 font-medium">
                    {u.globalName ?? u.username}
                    {u.isAdmin && <span className="opacity-60"> · admin</span>}
                  </td>
                  <td className="p-3 font-mono text-xs">{u.discordId}</td>
                  <td className="p-3">{u.allowed ? "allowed" : "no access"}</td>
                  <td className="p-3">{balances[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
