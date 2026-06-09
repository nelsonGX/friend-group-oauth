import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.return
    ? `?return=${encodeURIComponent(sp.return)}`
    : "";

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
      <div className="w-full max-w-sm rounded-xl border border-black/10 dark:border-white/15 p-8 text-center">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm opacity-70">
          Use your Discord account to continue.
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        )}

        <Link
          href={`/api/auth/discord/start${query}`}
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-[#5865F2] px-4 py-2.5 font-medium text-white transition hover:bg-[#4752c4]"
        >
          Login with Discord
        </Link>
      </div>
    </main>
  );
}
