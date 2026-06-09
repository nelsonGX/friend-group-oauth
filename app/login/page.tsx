import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { sanitizeReturnPath } from "@/lib/url";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; error?: string }>;
}) {
  const sp = await searchParams;

  // Already signed in — no reason to show the login form again.
  const user = await getCurrentUser();
  if (user) redirect(sanitizeReturnPath(sp.return));

  const query = sp.return ? `?return=${encodeURIComponent(sp.return)}` : "";

  const errors: Record<string, string> = {
    no_access:
      "You're signed in, but you don't have access yet. You need to be in the Discord server with the required role.",
    discord: "Something went wrong talking to Discord. Please try again.",
    state_mismatch: "Your login session expired. Please try again.",
    invalid_request: "Invalid login request. Please try again.",
    invalid_state: "Your login session expired. Please try again.",
  };
  const errorMessage = sp.error ? errors[sp.error] ?? "Login failed." : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card w-full max-w-sm p-8 text-center">
        <span className="pulse-ring mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-soft to-violet text-white shadow-[0_16px_40px_-12px_rgba(88,101,242,0.9)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19.7 5.3A16 16 0 0015.6 4l-.3.5a14.9 14.9 0 014.4 2.2 13.5 13.5 0 00-11.5 0A14.9 14.9 0 0112.7 4.5L12.4 4A16 16 0 008.3 5.3 16.7 16.7 0 005.5 17a16 16 0 004.9 2.5l.6-1a10.5 10.5 0 01-1.6-.8l.4-.3a11.4 11.4 0 009.4 0l.4.3a10.5 10.5 0 01-1.6.8l.6 1A16 16 0 0022.5 17a16.7 16.7 0 00-2.8-11.7zM9.7 14.3c-.8 0-1.5-.8-1.5-1.7s.6-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7zm4.6 0c-.8 0-1.5-.8-1.5-1.7s.6-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7z" />
          </svg>
        </span>

        <h1 className="mt-5 text-xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">
          Use your Discord account to continue.
        </p>

        {errorMessage && (
          <p className="mt-5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-left text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <a
          href={`/api/auth/discord/start${query}`}
          className="btn btn-primary mt-6 w-full py-3"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19.7 5.3A16 16 0 0015.6 4l-.3.5a14.9 14.9 0 014.4 2.2 13.5 13.5 0 00-11.5 0A14.9 14.9 0 0112.7 4.5L12.4 4A16 16 0 008.3 5.3 16.7 16.7 0 005.5 17a16 16 0 004.9 2.5l.6-1a10.5 10.5 0 01-1.6-.8l.4-.3a11.4 11.4 0 009.4 0l.4.3a10.5 10.5 0 01-1.6.8l.6 1A16 16 0 0022.5 17a16.7 16.7 0 00-2.8-11.7zM9.7 14.3c-.8 0-1.5-.8-1.5-1.7s.6-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7zm4.6 0c-.8 0-1.5-.8-1.5-1.7s.6-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7z" />
          </svg>
          Continue with Discord
        </a>

        <p className="mt-5 text-xs text-faint">
          Access requires membership in the group&apos;s Discord server.
        </p>
      </div>
    </main>
  );
}
