import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, Boxes, Coins, Wallet } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { getBalance, getIncome, getProviderEarnings } from "@/lib/credits";
import { getWithdrawableEarnings, listUserWithdrawals } from "@/lib/withdrawals";
import { SUPPORTED_SCOPES } from "@/lib/oauth";
import { env } from "@/lib/env";
import { installCommands } from "@/lib/skill";
import { ProviderApps } from "./ProviderApps";
import { IncomeReport, type IncomeRow } from "./IncomeReport";
import { Withdrawals, type WithdrawalRow } from "./Withdrawals";
import type { AppView } from "./AppDetailsModal";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/dashboard");
  // Not in the server at all — show the dedicated "switch account" gate instead.
  if (!user.inGuild) redirect("/no-access");

  const { t } = await getDictionary();
  const db = getDb();

  const owned = await db.select().from(clients).where(eq(clients.ownerUserId, user.id));
  const ownedEarnings = await Promise.all(owned.map((c) => getProviderEarnings(c.id)));
  const totalEarned = ownedEarnings.reduce((sum, n) => sum + n, 0);
  const balance = await getBalance(user.id);
  const income = await getIncome(user.id, 50);
  const withdrawable = await getWithdrawableEarnings(user.id);
  const myWithdrawals = await listUserWithdrawals(user.id);
  const canRegister = user.allowed || user.isAdmin;
  const appUrl = env.APP_URL;
  const skillCmds = installCommands();

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
    displayTitle: c.displayTitle,
    description: c.description,
    iconUrl: c.iconUrl,
    websiteUrl: c.websiteUrl,
    listed: c.listed,
    createdAt: c.createdAt.toISOString(),
  }));

  // Pre-format income for the (client) IncomeReport — Dates can't cross the boundary.
  const incomeRows: IncomeRow[] = income.map((e) => ({
    id: e.id,
    date: fmtDate(e.createdAt),
    appName: e.appName,
    reason: e.reason,
    fromName: e.fromName,
    amount: e.amount,
  }));

  // Same for the developer's own withdrawal requests.
  const withdrawalRows: WithdrawalRow[] = myWithdrawals.map((w) => ({
    id: w.id,
    date: fmtDate(w.createdAt),
    amount: w.amount,
    status: w.status,
    payoutDetails: w.payoutDetails,
    note: w.note,
    adminNote: w.adminNote,
  }));

  const stats = [
    { icon: Wallet, label: t.dashboard.statBalance, value: balance },
    { icon: Boxes, label: t.dashboard.statOwned, value: owned.length },
    { icon: Coins, label: t.dashboard.statEarned, value: totalEarned },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      {/* identity (nav lives in the global header; only the admin link is unique here) */}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t.dashboard.developerPanel}
            </p>
            <h1 className="text-xl font-semibold leading-tight">
              {user.globalName ?? user.username}
            </h1>
          </div>
        </div>
        {user.isAdmin && (
          <Link href="/admin" className="btn btn-ghost !py-2 text-sm">
            <Shield size={15} />
            {t.dashboard.admin}
          </Link>
        )}
      </div>

      {/* compact stats strip — glanceable context, not a competing hero */}
      <div
        className="reveal mt-8 grid gap-3 sm:grid-cols-3"
        style={{ animationDelay: "60ms" }}
      >
        {stats.map(({ icon: Icon, label, value }) => (
          <section key={label} className="card card-hover flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-strong text-brand-soft">
              <Icon size={17} />
            </span>
            <div>
              <p className="text-xl font-semibold tabular-nums leading-none">{value}</p>
              <p className="mt-1 text-xs text-muted">{label}</p>
            </div>
          </section>
        ))}
      </div>

      {/* your apps — the centerpiece */}
      <div className="reveal mt-10" style={{ animationDelay: "120ms" }}>
        <ProviderApps
          apps={appViews}
          appUrl={appUrl}
          canRegister={canRegister}
          supportedScopes={[...SUPPORTED_SCOPES]}
          scopeInfo={t.authorize.scopes}
          skillCmds={skillCmds}
          t={t.dashboard}
        />
      </div>

      {/* income — secondary, recent first, expandable */}
      <div className="reveal mt-10" style={{ animationDelay: "180ms" }}>
        <IncomeReport entries={incomeRows} t={t.dashboard.income} />
      </div>

      {/* withdraw earnings — cash out income to real money via an admin */}
      <div className="reveal mt-10" style={{ animationDelay: "240ms" }}>
        <Withdrawals
          available={withdrawable.available}
          earned={withdrawable.earned}
          reserved={withdrawable.reserved}
          entries={withdrawalRows}
          t={t.dashboard.withdraw}
        />
      </div>
    </main>
  );
}
