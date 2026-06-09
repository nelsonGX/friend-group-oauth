import Link from "next/link";
import { ArrowLeft, Users, Boxes, Coins, Wallet } from "lucide-react";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import { getBalance, getProviderEarnings } from "@/lib/credits";
import { AdminClient, type AdminProviderRow, type AdminUserRow } from "./AdminClient";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const { t } = await getDictionary();
  const db = getDb();

  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const balances = await Promise.all(allUsers.map((u) => getBalance(u.id)));
  const allClients = await db.select().from(clients).orderBy(desc(clients.createdAt));
  const earnings = await Promise.all(allClients.map((c) => getProviderEarnings(c.id)));

  const userRows: AdminUserRow[] = allUsers.map((u, i) => ({
    id: u.id,
    discordId: u.discordId,
    name: u.globalName ?? u.username,
    avatar: u.avatar,
    isAdmin: u.isAdmin,
    allowed: u.allowed,
    balance: balances[i],
    isSelf: u.id === admin.id,
  }));

  const providerRows: AdminProviderRow[] = allClients.map((c, i) => ({
    id: c.id,
    name: c.name,
    clientId: c.clientId,
    scopes: c.allowedScopes,
    earned: earnings[i],
    isActive: c.isActive,
    trusted: c.trusted,
    listed: c.listed,
  }));

  const allowedCount = allUsers.filter((u) => u.allowed).length;
  const activeCount = allClients.filter((c) => c.isActive).length;
  const circulation = balances.reduce((sum, n) => sum + n, 0);
  const totalEarned = earnings.reduce((sum, n) => sum + n, 0);

  const stats = [
    {
      icon: Users,
      label: t.admin.stats.users,
      value: allUsers.length,
      sub: format(t.admin.stats.withAccess, { n: allowedCount }),
    },
    {
      icon: Boxes,
      label: t.admin.stats.providers,
      value: allClients.length,
      sub: format(t.admin.stats.active, { n: activeCount }),
    },
    {
      icon: Coins,
      label: t.admin.stats.circulation,
      value: circulation,
      sub: null,
    },
    {
      icon: Wallet,
      label: t.admin.stats.earned,
      value: totalEarned,
      sub: null,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      <div
        className="reveal flex items-center justify-between"
        style={{ animationDelay: "0ms" }}
      >
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">{t.admin.title}</h1>
          <span className="badge badge-success">
            <span className="dot" />
            {t.admin.elevated}
          </span>
        </div>
        <Link href="/dashboard" className="btn btn-ghost !py-2 text-sm">
          <ArrowLeft size={15} />
          {t.admin.dashboard}
        </Link>
      </div>

      <div
        className="reveal mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        style={{ animationDelay: "60ms" }}
      >
        {stats.map(({ icon: Icon, label, value, sub }) => (
          <section key={label} className="card card-hover flex items-center gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-strong text-brand-soft">
              <Icon size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
              <p className="mt-1 truncate text-sm text-muted">{label}</p>
              {sub && <p className="text-xs text-faint">{sub}</p>}
            </div>
          </section>
        ))}
      </div>

      <AdminClient users={userRows} providers={providerRows} t={t.admin} />
    </main>
  );
}
