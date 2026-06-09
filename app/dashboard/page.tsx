import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield, LogOut, Compass, Boxes, Coins } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { getProviderEarnings } from "@/lib/credits";
import { SUPPORTED_SCOPES } from "@/lib/oauth";
import { env } from "@/lib/env";
import { ProviderApps } from "./ProviderApps";
import type { AppView } from "./AppDetailsModal";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/dashboard");

  const { t } = await getDictionary();
  const db = getDb();

  const owned = await db.select().from(clients).where(eq(clients.ownerUserId, user.id));
  const ownedEarnings = await Promise.all(owned.map((c) => getProviderEarnings(c.id)));
  const totalEarned = ownedEarnings.reduce((sum, n) => sum + n, 0);
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
    displayTitle: c.displayTitle,
    description: c.description,
    iconUrl: c.iconUrl,
    websiteUrl: c.websiteUrl,
    listed: c.listed,
    createdAt: c.createdAt.toISOString(),
  }));

  const stats = [
    { icon: Boxes, label: t.dashboard.statOwned, value: owned.length },
    { icon: Coins, label: t.dashboard.statEarned, value: totalEarned },
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
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t.dashboard.developerPanel}
            </p>
            <h1 className="text-xl font-semibold leading-tight">
              {user.globalName ?? user.username}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/explore" className="btn btn-ghost !py-2 text-sm">
            <Compass size={15} />
            {t.nav.explore}
          </Link>
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
        className="reveal mt-8 grid gap-4 sm:grid-cols-2"
        style={{ animationDelay: "80ms" }}
      >
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

      {/* your apps */}
      <div className="reveal mt-8" style={{ animationDelay: "140ms" }}>
        <ProviderApps
          apps={appViews}
          appUrl={appUrl}
          canRegister={canRegister}
          supportedScopes={[...SUPPORTED_SCOPES]}
          scopeInfo={t.authorize.scopes}
          t={t.dashboard}
        />
      </div>
    </main>
  );
}
