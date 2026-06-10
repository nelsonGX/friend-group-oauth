"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Boxes, ExternalLink, Search } from "lucide-react";
import { format } from "@/lib/i18n/format";

export type AppCategory = "tools" | "fun";

/** One published directory listing, pre-shaped on the server for display. */
export interface DirectoryApp {
  id: string;
  clientId: string;
  title: string;
  owner: string | null;
  description: string | null;
  iconUrl: string | null;
  websiteUrl: string | null;
  category: AppCategory;
  connected: boolean;
}

interface DirectoryDict {
  searchPlaceholder: string;
  categoryTools: string;
  categoryFun: string;
  noResults: string;
  emptyTitle: string;
  emptyDesc: string;
  connected: string;
  visit: string;
  by: string;
}

/** Ordered category sections — Tools first, then the fun stuff. */
const SECTIONS: { key: AppCategory; labelKey: "categoryTools" | "categoryFun" }[] = [
  { key: "tools", labelKey: "categoryTools" },
  { key: "fun", labelKey: "categoryFun" },
];

/**
 * The searchable, category-grouped app directory. The server hands us every
 * listed app already shaped for display; filtering and grouping happen here so a
 * member can find an app by name/owner/description without a round-trip.
 */
export function ExploreDirectory({
  apps,
  t,
}: {
  apps: DirectoryApp[];
  t: DirectoryDict;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      [a.title, a.description, a.owner].some((field) =>
        field?.toLowerCase().includes(q),
      ),
    );
  }, [apps, query]);

  // Nothing published at all — the empty directory state (search would be moot).
  if (apps.length === 0) {
    return (
      <div className="card card-hover mt-4 flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-strong text-faint">
          <Boxes size={22} />
        </span>
        <div>
          <p className="font-medium">{t.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t.emptyDesc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="search"
          className="input pl-10!"
          value={query}
          aria-label={t.searchPlaceholder}
          placeholder={t.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">{t.noResults}</p>
      ) : (
        <div className="mt-6 space-y-8">
          {SECTIONS.map(({ key, labelKey }) => {
            const inSection = filtered.filter((a) => a.category === key);
            if (inSection.length === 0) return null;
            return (
              <section key={key}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                  {t[labelKey]}
                </h3>
                <ul className="mt-3 space-y-3">
                  {inSection.map((app) => (
                    <AppCard key={app.id} app={app} t={t} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A single directory listing card. */
function AppCard({ app, t }: { app: DirectoryApp; t: DirectoryDict }) {
  return (
    <li className="card card-hover-border flex items-center gap-4 p-5">
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
          {app.title.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="min-w-0 wrap-break-word font-medium leading-tight">
            {app.title}
          </h4>
          {app.connected && (
            <span className="badge badge-success shrink-0">
              <span className="dot" />
              {t.connected}
            </span>
          )}
        </div>
        {app.owner && (
          <p className="mt-0.5 text-xs text-faint">
            {format(t.by, { name: app.owner })}
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
          {t.visit}
        </a>
      )}
    </li>
  );
}
