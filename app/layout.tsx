import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { HeaderNav } from "@/components/HeaderNav";
import { TopProgress } from "@/components/TopProgress";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Friend Group Auth",
  description:
    "Discord-based login and shared credits for our self-hosted tools.",
};

/** Brand wordmark backed by the icon.webp logo. */
function Brand() {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
    >
      <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-border transition-transform duration-300 group-hover:scale-105">
        <Image
          src="/assets/icon.webp"
          alt="FriendAuth"
          width={36}
          height={36}
          className="h-full w-full object-contain"
        />
      </span>
      <span>
        Friend<span className="text-muted">Auth</span>
      </span>
    </Link>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, { locale, t }] = await Promise.all([
    getCurrentUser(),
    getDictionary(),
  ]);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        <TopProgress />
        <header className="sticky top-0 z-30 border-b border-border bg-bg">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
            <Brand />
            <HeaderNav
              user={!!user}
              t={t.nav}
              switcherLocale={locale}
              switcherLabel={t.switcher.label}
            />
          </div>
        </header>

        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
