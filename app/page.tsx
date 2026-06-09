import Link from "next/link";
import { Users, KeyRound, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { DiscordIcon } from "@/components/DiscordIcon";

const features = [
  {
    t: "Discord login",
    d: "OAuth2 with server membership and role gating, so only the group gets in.",
    Icon: Users,
  },
  {
    t: "OAuth provider",
    d: "Standard OAuth2 + PKCE that any of our other sites can authenticate against.",
    Icon: KeyRound,
  },
  {
    t: "Shared credits",
    d: "One balance every tool can charge against — top up once, spend anywhere.",
    Icon: Wallet,
  },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-5 py-20 text-center">
      <section className="flex flex-col items-center">
        <span
          className="reveal badge mb-6"
          style={{ animationDelay: "0ms" }}
        >
          <span className="dot text-brand-soft" />
          One login for the whole group
        </span>

        <h1
          className="reveal max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
          style={{ animationDelay: "70ms" }}
        >
          One Discord login.
          <br />
          <span className="text-gradient">Shared credits everywhere.</span>
        </h1>

        <p
          className="reveal mt-6 max-w-xl text-balance text-base leading-relaxed text-muted sm:text-lg"
          style={{ animationDelay: "140ms" }}
        >
          A single sign-in and a shared credit balance for all of our
          self-hosted tools. Authenticate once; use it everywhere the group
          builds.
        </p>

        <div
          className="reveal mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "210ms" }}
        >
          {user ? (
            <Link href="/dashboard" className="btn btn-primary px-6 py-3 text-[0.95rem]">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-primary px-6 py-3 text-[0.95rem]">
                <DiscordIcon size={18} />
                Sign in with Discord
              </Link>
              <Link href="/dashboard" className="btn btn-secondary px-6 py-3 text-[0.95rem]">
                Open dashboard
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="grid w-full max-w-3xl gap-4 text-left sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={f.t}
            className="reveal card card-hover p-5"
            style={{ animationDelay: `${300 + i * 90}ms` }}
          >
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-brand-soft">
              <f.Icon size={22} strokeWidth={1.7} />
            </span>
            <h2 className="font-medium">{f.t}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.d}</p>
          </div>
        ))}
      </section>

      <p
        className="reveal text-sm text-faint"
        style={{ animationDelay: "600ms" }}
      >
        Building a site that uses this? See{" "}
        <code className="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-[0.8rem] text-muted">
          docs/INTEGRATION.md
        </code>
        .
      </p>
    </main>
  );
}
