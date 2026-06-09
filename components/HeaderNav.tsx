"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, Compass, LayoutDashboard, LogOut, LogIn } from "lucide-react";

export type NavStrings = {
  dashboard: string;
  explore: string;
  signIn: string;
  logout: string;
  menu: string;
};

/** True when `href` names the section the current pathname sits in. */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop (≥sm) page links. The link for the current section is highlighted
 * (brand tint + `aria-current`) so it's obvious which page you're on; the rest
 * stay muted. Icons match the mobile menu for a consistent read across widths.
 */
function BarLinks({
  user,
  t,
  pathname,
}: {
  user: boolean;
  t: NavStrings;
  pathname: string;
}) {
  if (!user) {
    return (
      <Link href="/login" className="btn btn-primary !px-3.5 !py-1.5">
        {t.signIn}
      </Link>
    );
  }

  const base =
    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer";
  const active = "bg-brand/15 text-brand-soft";
  const idle = "text-muted hover:bg-surface-strong hover:text-ink";

  const links = [
    { href: "/dashboard", label: t.dashboard, Icon: LayoutDashboard },
    { href: "/explore", label: t.explore, Icon: Compass },
  ];

  return (
    <>
      {links.map(({ href, label, Icon }) => {
        const on = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`${base} ${on ? active : idle}`}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
      <div className="mx-1 h-5 w-px bg-border" />
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className={`${base} ${idle} hover:!bg-danger/10 hover:!text-danger`}
        >
          <LogOut size={16} />
          {t.logout}
        </button>
      </form>
    </>
  );
}

// Shared shape for a row inside the mobile menu card. Icons inherit the row's
// text color (no own color) so they transition together on hover/press.
const row =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer";

/** Mobile (<sm) actions — icon rows inside the floating menu card. */
function MenuLinks({
  user,
  t,
  pathname,
  onNavigate,
}: {
  user: boolean;
  t: NavStrings;
  pathname: string;
  onNavigate: () => void;
}) {
  if (!user) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className={`${row} text-brand-soft hover:bg-surface-strong`}
      >
        <LogIn size={17} />
        {t.signIn}
      </Link>
    );
  }

  // Active row: brand tint, matching the desktop bar. Idle: muted → ink on hover.
  const active = "bg-brand/15 text-brand-soft";
  const idle = "text-muted hover:bg-surface-strong hover:text-ink";

  const links = [
    { href: "/dashboard", label: t.dashboard, Icon: LayoutDashboard },
    { href: "/explore", label: t.explore, Icon: Compass },
  ];

  return (
    <>
      {links.map(({ href, label, Icon }) => {
        const on = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={on ? "page" : undefined}
            className={`${row} ${on ? active : idle}`}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
      <div className="my-1 h-px bg-border" />
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className={`${row} text-muted hover:bg-danger/10 hover:text-danger`}
        >
          <LogOut size={17} />
          {t.logout}
        </button>
      </form>
    </>
  );
}

/**
 * Responsive header navigation. The language switcher (a Server Component) is
 * passed in as `switcher` and stays visible at every width; the page links sit
 * inline on ≥sm and collapse into a floating menu card below `sm`. The link for
 * the current route is highlighted at both widths.
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
  const pathname = usePathname();

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
    <nav className="flex items-center gap-2 text-sm">
      {switcher}

      {/* ≥sm: page links inline in the bar. */}
      <div className="hidden items-center gap-1 sm:flex">
        <BarLinks user={user} t={t} pathname={pathname} />
      </div>

      {/* <sm: icon toggle. */}
      <button
        type="button"
        aria-label={t.menu}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mr-1 inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-surface-strong hover:text-ink sm:hidden"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* <sm: blurred scrim + floating menu card, anchored under the header. */}
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fade-in fixed inset-x-0 bottom-0 top-14 z-40 cursor-default bg-black/40 backdrop-blur-sm sm:hidden"
          />
          <div
            role="menu"
            className="modal-pop absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-2xl border border-border-strong bg-bg-soft p-1.5 shadow-2xl shadow-black/50 sm:hidden"
          >
            <MenuLinks
              user={user}
              t={t}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </nav>
  );
}
