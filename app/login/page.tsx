import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { sanitizeReturnPath } from "@/lib/url";
import { DiscordIcon } from "@/components/DiscordIcon";

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
          <DiscordIcon size={26} />
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
          <DiscordIcon size={20} />
          Continue with Discord
        </a>

        <p className="mt-5 text-xs text-faint">
          Access requires membership in the group&apos;s Discord server.
        </p>
      </div>
    </main>
  );
}
