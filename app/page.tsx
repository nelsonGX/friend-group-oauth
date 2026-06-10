import Link from "next/link";
import type { Metadata } from "next";
import { Users, KeyRound, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { DiscordIcon } from "@/components/DiscordIcon";

export const metadata: Metadata = {
  title: "Friend Group Auth",
  description: "Discord login and shared credits for self-hosted group tools.",
};

export default async function Home() {
  const [user, { t }] = await Promise.all([getCurrentUser(), getDictionary()]);

  const features = [
    { ...t.home.features.login, Icon: Users },
    { ...t.home.features.oauth, Icon: KeyRound },
    { ...t.home.features.credits, Icon: Wallet },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-5 py-20 text-center">
      <section className="flex flex-col items-center">
        <span
          className="reveal badge mb-6"
          style={{ animationDelay: "0ms" }}
        >
          <span className="dot text-brand-soft" />
          {t.home.badge}
        </span>

        <h1
          className="reveal max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
          style={{ animationDelay: "40ms" }}
        >
          {t.home.titleLine1}
          <br />
          <span className="text-gradient">{t.home.titleLine2}</span>
        </h1>

        <p
          className="reveal mt-6 max-w-xl text-balance text-base leading-relaxed text-muted sm:text-lg"
          style={{ animationDelay: "80ms" }}
        >
          {t.home.subtitle}
        </p>

        <div
          className="reveal mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "120ms" }}
        >
          {user ? (
            <Link href="/explore" className="btn btn-primary px-6 py-3 text-[0.95rem]">
              {t.home.openDashboard}
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-primary px-6 py-3 text-[0.95rem]">
                <DiscordIcon size={18} />
                {t.home.signInWithDiscord}
              </Link>
              <Link href="/explore" className="btn btn-secondary px-6 py-3 text-[0.95rem]">
                {t.home.openDashboard}
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="grid w-full max-w-3xl gap-4 text-left sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="reveal card card-hover p-5"
            style={{ animationDelay: `${170 + i * 50}ms` }}
          >
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-brand-soft">
              <f.Icon size={22} strokeWidth={1.7} />
            </span>
            <h2 className="font-medium">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.desc}</p>
          </div>
        ))}
      </section>

      <p
        className="reveal text-sm text-faint"
        style={{ animationDelay: "320ms" }}
      >
        {t.home.integrationPre}{" "}
        <code className="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-[0.8rem] text-muted">
          docs/INTEGRATION.md
        </code>
        {t.home.integrationPost}
      </p>
    </main>
  );
}
