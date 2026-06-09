import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="max-w-xl">
        <h1 className="text-3xl font-semibold sm:text-4xl">Friend Group Auth</h1>
        <p className="mt-4 text-balance opacity-70">
          One Discord-based login and a shared credit balance for all of our
          self-hosted tools. Sign in once; use it everywhere our group builds.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="rounded-md bg-[#5865F2] px-5 py-2.5 font-medium text-white transition hover:bg-[#4752c4]"
        >
          Sign in with Discord
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-black/15 px-5 py-2.5 font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Dashboard
        </Link>
      </div>

      <div className="grid max-w-2xl gap-4 text-left sm:grid-cols-3">
        {[
          { t: "Discord login", d: "OAuth2 with server membership + role gating." },
          { t: "OAuth provider", d: "Standard OAuth2 + PKCE for our other sites." },
          { t: "Credits", d: "A shared balance our tools can charge against." },
        ].map((f) => (
          <div
            key={f.t}
            className="rounded-xl border border-black/10 p-4 dark:border-white/15"
          >
            <h2 className="font-medium">{f.t}</h2>
            <p className="mt-1 text-sm opacity-70">{f.d}</p>
          </div>
        ))}
      </div>

      <p className="text-sm opacity-60">
        Building a site that uses this? See{" "}
        <code className="rounded bg-black/5 px-1 dark:bg-white/10">
          docs/INTEGRATION.md
        </code>
        .
      </p>
    </main>
  );
}
