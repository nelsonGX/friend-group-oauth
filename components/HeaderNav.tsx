"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type NavStrings = {
  dashboard: string;
  explore: string;
  signIn: string;
  logout: string;
  menu: string;
};

/**
 * The header's action links — Developer panel / Explore / Log out when signed
 * in, otherwise Sign in. Rendered twice: inline in the bar on ≥sm, and stacked
 * inside the mobile dropdown on <sm. `variant` switches between the two shapes;
 * `onNavigate` lets the dropdown close itself when a link is tapped.
 */
function NavLinks({
  user,
  t,
  variant,
  onNavigate,
}: {
  user: boolean;
  t: NavStrings;
  variant: "bar" | "menu";
  onNavigate?: () => void;
}) {
  // In the dropdown the controls go full-width and a touch taller for tapping.
  const wide = variant === "menu" ? "w-full " : "";

  if (!user) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className={`btn btn-primary ${wide}!px-3.5 !py-1.5`}
      >
        {t.signIn}
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`btn btn-ghost ${wide}!px-3 !py-1.5`}
      >
        {t.dashboard}
      </Link>
      <Link
        href="/explore"
        onClick={onNavigate}
        className={`btn btn-primary ${wide}!px-3.5 !py-1.5`}
      >
        {t.explore}
      </Link>
      <form
        action="/api/auth/logout"
        method="post"
        className={variant === "menu" ? "w-full" : undefined}
      >
        <button className={`btn btn-ghost ${wide}!px-3 !py-1.5`}>
          {t.logout}
        </button>
      </form>
    </>
  );
}

/**
 * Responsive header navigation. The language switcher (a Server Component) is
 * passed in as `switcher` and stays visible at every width; the action links
 * collapse behind a hamburger toggle below the `sm` breakpoint.
 */
export function HeaderNav({
  user,
  t,
  switcher,
}: {
  user: boolean;
  t: NavStrings;
  switcher: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Close the menu on Escape while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {switcher}

      {/* ≥sm: actions inline in the bar. */}
      <div className="hidden items-center gap-1.5 sm:flex">
        <NavLinks user={user} t={t} variant="bar" />
      </div>

      {/* <sm: hamburger toggle. */}
      <button
        type="button"
        aria-label={t.menu}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost !px-2 !py-2 sm:hidden"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* <sm: dropdown panel anchored under the (sticky, positioned) header. */}
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-40 cursor-default bg-black/40 sm:hidden"
          />
          <div className="absolute inset-x-0 top-full z-50 border-b border-border bg-bg sm:hidden">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3">
              <NavLinks
                user={user}
                t={t}
                variant="menu"
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
