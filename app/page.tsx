import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

const features = [
  {
    t: "Discord login",
    d: "OAuth2 with server membership and role gating, so only the group gets in.",
    icon: (
      <path
        d="M5 16c0-3.9 3.1-7 7-7s7 3.1 7 7M12 9a3.2 3.2 0 100-6.4A3.2 3.2 0 0012 9z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    ),
  },
  {
    t: "OAuth provider",
    d: "Standard OAuth2 + PKCE that any of our other sites can authenticate against.",
    icon: (
      <path
        d="M10 14l-3.2 3.2a3 3 0 11-4.2-4.2L5.8 9.8M14 10l3.2-3.2a3 3 0 114.2 4.2L18.2 14M9 15l6-6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    t: "Shared credits",
    d: "One balance every tool can charge against — top up once, spend anywhere.",
    icon: (
      <path
        d="M3 8.5h18M3 8.5A2.5 2.5 0 015.5 6h13A2.5 2.5 0 0121 8.5v7A2.5 2.5 0 0118.5 18h-13A2.5 2.5 0 013 15.5v-7zM15 14h3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M19.7 5.3A16 16 0 0015.6 4l-.3.5a14.9 14.9 0 014.4 2.2 13.5 13.5 0 00-11.5 0A14.9 14.9 0 0112.7 4.5L12.4 4A16 16 0 008.3 5.3 16.7 16.7 0 005.5 17a16 16 0 004.9 2.5l.6-1a10.5 10.5 0 01-1.6-.8l.4-.3a11.4 11.4 0 009.4 0l.4.3a10.5 10.5 0 01-1.6.8l.6 1A16 16 0 0022.5 17a16.7 16.7 0 00-2.8-11.7zM9.7 14.3c-.8 0-1.5-.8-1.5-1.7s.6-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7zm4.6 0c-.8 0-1.5-.8-1.5-1.7s.6-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7z" />
                </svg>
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
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                {f.icon}
              </svg>
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
