import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Boxes, Compass, ExternalLink } from "lucide-react";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";

/**
 * The user-facing directory: every app a developer has opted into showing
 * (`listed` + active). Members browse what the group has built and jump straight
 * to each tool. Apps the current user has already signed into are flagged.
 */
export default async function ExplorePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/explore");

  const { t } = await getDictionary();
  const db = getDb();

  const apps = await db
    .select()
    .from(clients)
    .where(and(eq(clients.listed, true), eq(clients.isActive, true)))
    .orderBy(asc(clients.name));

  // Which of these the user already has a live token for → "Connected" badge.
  const connectedRows = await db
    .selectDistinct({ clientId: accessTokens.clientId })
    .from(accessTokens)
    .where(
      and(
        eq(accessTokens.userId, user.id),
        eq(accessTokens.revoked, false),
        gt(accessTokens.expiresAt, new Date()),
      ),
    );
  const connected = new Set(connectedRows.map((r) => r.clientId));

  const e = t.explore;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
      <div
        className="reveal flex flex-wrap items-center justify-between gap-4"
        style={{ animationDelay: "0ms" }}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-strong text-brand-soft">
            <Compass size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">{e.heading}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">{e.subtitle}</p>
          </div>
        </div>
        <Link href="/dashboard" className="btn btn-ghost !py-2 text-sm">
          <ArrowLeft size={15} />
          {t.nav.dashboard}
        </Link>
      </div>

      {apps.length === 0 ? (
        <div className="reveal card mt-8 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-strong text-faint">
            <Boxes size={22} />
          </span>
          <div>
            <p className="font-medium">{e.emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{e.emptyDesc}</p>
          </div>
        </div>
      ) : (
        <ul className="reveal mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ animationDelay: "80ms" }}>
          {apps.map((app) => {
            const title = app.displayTitle ?? app.name;
            return (
              <li key={app.id} className="card card-hover flex flex-col p-5">
                <div className="flex items-start gap-3">
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={app.iconUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-border"
                    />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-soft to-violet text-lg font-semibold text-white">
                      {title.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 break-words font-medium leading-tight">
                        {title}
                      </h2>
                      {connected.has(app.clientId) && (
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
    </main>
  );
}
