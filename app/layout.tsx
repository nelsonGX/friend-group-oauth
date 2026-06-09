import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
      <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-white p-1 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/15 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/icon.webp"
          alt="FriendAuth"
          className="h-full w-full object-contain"
        />
      </span>
      <span>
        Friend<span className="text-muted">Auth</span>
      </span>
    </Link>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        {/* ambient background */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div className="blob blob-1 -left-32 -top-32 h-[34rem] w-[34rem] bg-brand/25" />
          <div className="blob blob-2 right-[-10rem] top-1/3 h-[30rem] w-[30rem] bg-violet/20" />
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage:
                "radial-gradient(60rem 60rem at 50% 0%, black, transparent 75%)",
            }}
          />
        </div>

        <header className="sticky top-0 z-30 border-b border-border/60 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6">
            <Brand />
            <nav className="flex items-center gap-1.5 text-sm">
              <Link href="/dashboard" className="btn btn-ghost !px-3 !py-1.5">
                Dashboard
              </Link>
              <Link href="/login" className="btn btn-primary !px-3.5 !py-1.5">
                Sign in
              </Link>
            </nav>
          </div>
        </header>

        <div className="flex flex-1 flex-col">{children}</div>

        <footer className="border-t border-border/60 py-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-6 text-xs text-faint sm:flex-row">
            <span>Friend Group Auth — Discord login &amp; shared credits.</span>
            <span>Self-hosted by the group, for the group.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
