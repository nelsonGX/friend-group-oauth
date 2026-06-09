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
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      <div
        className="reveal flex items-center justify-between"
        style={{ animationDelay: "0ms" }}
      >
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <span className="badge badge-success">
            <span className="dot" />
            elevated
          </span>
        </div>
        <Link href="/dashboard" className="btn btn-ghost !py-2 text-sm">
          ← Dashboard
        </Link>
      </div>

      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <section
          className="reveal card p-6"
          style={{ animationDelay: "80ms" }}
        >
          <h2 className="font-semibold">Grant credits</h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            Manual top-up after a user pays you out-of-band.
          </p>
          <GrantCreditsForm />
        </section>

        <section
          className="reveal card p-6"
          style={{ animationDelay: "150ms" }}
        >
          <h2 className="font-semibold">Register a provider</h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            Create OAuth credentials for a friend&apos;s site.
          </p>
          <NewClientForm />
        </section>
      </div>

      <section className="reveal mt-9" style={{ animationDelay: "220ms" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          Providers <span className="text-muted">({allClients.length})</span>
        </h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">client_id</th>
                <th className="p-4 font-medium">Scopes</th>
                <th className="p-4 font-medium">Earned</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="glass-divide">
              {allClients.map((c, i) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-strong">
                  <td className="p-4 font-medium">{c.name}</td>
                  <td className="p-4 font-mono text-xs text-muted">{c.clientId}</td>
                  <td className="p-4 text-muted">{c.allowedScopes.join(", ")}</td>
                  <td className="p-4 tabular-nums">{earnings[i]}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`badge ${c.isActive ? "badge-success" : "badge-danger"}`}
                      >
                        {c.isActive ? "active" : "disabled"}
                      </span>
                      {c.trusted && <span className="badge">trusted</span>}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-3">
                      <form action={toggleClientActive}>
                        <input type="hidden" name="clientId" value={c.clientId} />
                        <button className="link text-sm underline underline-offset-2">
                          {c.isActive ? "disable" : "enable"}
                        </button>
                      </form>
                      <form action={toggleClientTrusted}>
                        <input type="hidden" name="clientId" value={c.clientId} />
                        <button className="link text-sm underline underline-offset-2">
                          {c.trusted ? "untrust" : "trust"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {allClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted">
                    No providers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="reveal mt-9" style={{ animationDelay: "300ms" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
          Users <span className="text-muted">({allUsers.length})</span>
        </h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="p-4 font-medium">User</th>
                <th className="p-4 font-medium">Discord ID</th>
                <th className="p-4 font-medium">Access</th>
                <th className="p-4 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="glass-divide">
              {allUsers.map((u, i) => (
                <tr key={u.id} className="transition-colors hover:bg-surface-strong">
                  <td className="p-4 font-medium">
                    {u.globalName ?? u.username}
                    {u.isAdmin && (
                      <span className="badge ml-2 align-middle">admin</span>
                    )}
                  </td>
                  <td className="p-4 font-mono text-xs text-muted">{u.discordId}</td>
                  <td className="p-4">
                    <span
                      className={`badge ${u.allowed ? "badge-success" : "badge-danger"}`}
                    >
                      {u.allowed ? "allowed" : "no access"}
                    </span>
                  </td>
                  <td className="p-4 tabular-nums">{balances[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
