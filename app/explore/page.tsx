import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Boxes, ExternalLink, Shield } from "lucide-react";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import { getBalance, getActivity, type ActivityEntry } from "@/lib/credits";
import { ConnectedApps } from "../dashboard/ConnectedApps";
import { WalletActions } from "./WalletActions";
import { RedeemCode } from "./RedeemCode";
import { CreditBalance } from "./CreditBalance";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export const metadata: Metadata = {
  title: "Explore | Friend Group Auth",
  description: "Browse group apps, manage connected apps, and use shared credits.",
};

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Human label for a wallet activity row, derived from its kind + counterparty. */
function activityLabel(entry: ActivityEntry, d: Dictionary["dashboard"]): string {
  const name = entry.counterpartyName ?? d.someone;
  switch (entry.kind) {
    case "transfer_out":
      return format(d.transferOut, { name });
    case "transfer_in":
      return format(d.transferIn, { name });
    case "income":
      return format(d.paymentFrom, { name });
    case "charge":
      return (
        entry.reason ??
        (entry.appName ? format(d.paymentTo, { name: entry.appName }) : d.charge)
      );
    case "topup":
      return entry.reason ?? d.topUp;
    case "redeem":
      return entry.reason ?? d.redeem;
    case "withdrawal":
      return entry.reason ?? d.withdrawal;
    case "withdrawal_refund":
      return entry.reason ?? d.withdrawalRefund;
    default:
      return entry.reason ?? (entry.delta > 0 ? d.topUp : d.charge);
  }
}

/**
 * The user-facing home: a member's credit balance, the apps they've connected,
 * the public directory of group apps they can use, and their recent activity.
 * App-building/management lives separately in the developer panel (/dashboard).
 */
export default async function ExplorePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/explore");
  // Not in the server at all — show the dedicated "switch account" gate instead.
  if (!user.inGuild) redirect("/no-access");

  const db = getDb();

  // Apps the user has authorized (live tokens), with display names.
  const connectedQuery = db
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
  // The opted-in, active directory listings, with their owner's display name.
  const listedQuery = db
    .select({
      id: clients.id,
      clientId: clients.clientId,
      name: clients.name,
      displayTitle: clients.displayTitle,
      description: clients.description,
      iconUrl: clients.iconUrl,
      websiteUrl: clients.websiteUrl,
      ownerName: users.globalName,
      ownerUsername: users.username,
    })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.ownerUserId))
    .where(and(eq(clients.listed, true), eq(clients.isActive, true)))
    .orderBy(asc(clients.name));

  const [{ t }, balance, entries, connected, listed] = await Promise.all([
    getDictionary(),
    getBalance(user.id),
    getActivity(user.id, 25),
    connectedQuery,
    listedQuery,
  ]);
  const connectedIds = new Set(connected.map((c) => c.clientId));

  const d = t.dashboard;
  const e = t.explore;

  // Pre-render the ledger into plain rows for the balance popup (client side).
  const activity = entries.map((entry) => ({
    id: entry.id,
    time: fmt(entry.createdAt),
    label: activityLabel(entry, d),
    delta: entry.delta,
  }));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      {/* identity + balance */}
      <div
        className="reveal flex flex-wrap items-center justify-between gap-x-6 gap-y-4"
        style={{ animationDelay: "0ms" }}
      >
        <div className="flex items-center gap-3.5">
          {user.avatar ? (
            <Image
              src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
              alt=""
              width={48}
              height={48}
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
        <div className="flex items-center gap-3">
          <CreditBalance
            balance={balance}
            entries={activity}
            t={{
              creditBalance: d.creditBalance,
              credits: d.credits,
              recentActivity: d.recentActivity,
              noTransactions: d.noTransactions,
            }}
          />
          {user.isAdmin && (
            <Link href="/admin" className="btn btn-ghost py-2! text-sm">
              <Shield size={15} />
              {d.admin}
            </Link>
          )}
        </div>
      </div>

      {/* directory | connected */}
      <div className="mt-10 grid items-start gap-8 lg:grid-cols-3">
        <section className="reveal lg:col-span-2" style={{ animationDelay: "60ms" }}>
          <h2 className="text-lg font-semibold">{e.heading}</h2>
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
            <ul className="mt-4 space-y-3">
              {listed.map((app) => {
                const title = app.displayTitle ?? app.name;
                const owner = app.ownerName ?? app.ownerUsername;
                return (
                  <li
                    key={app.id}
                    className="card card-hover-border flex items-center gap-4 p-5"
                  >
                    {app.iconUrl ? (
                      <Image
                        src={app.iconUrl}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-lg font-semibold text-white">
                        {title.slice(0, 1).toUpperCase()}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="min-w-0 wrap-break-word font-medium leading-tight">
                          {title}
                        </h3>
                        {connectedIds.has(app.clientId) && (
                          <span className="badge badge-success shrink-0">
                            <span className="dot" />
                            {e.connected}
                          </span>
                        )}
                      </div>
                      {owner && (
                        <p className="mt-0.5 text-xs text-faint">
                          {format(e.by, { name: owner })}
                        </p>
                      )}
                      {app.description && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-muted">
                          {app.description}
                        </p>
                      )}
                    </div>

                    {app.websiteUrl && (
                      <a
                        href={app.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary shrink-0 py-1.5! text-sm"
                      >
                        <ExternalLink size={15} />
                        {e.visit}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="reveal space-y-6 lg:sticky lg:top-20" style={{ animationDelay: "120ms" }}>
          {user.allowed && <RedeemCode t={e.redeem} />}
          {user.allowed && <WalletActions t={e.wallet} />}
          <ConnectedApps
            apps={connected.map((c) => ({ clientId: c.clientId, name: c.name }))}
            t={d}
          />
        </aside>
      </div>
    </main>
  );
}
