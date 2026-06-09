import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
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

  const { t } = await getDictionary();
  const query = sp.return ? `?return=${encodeURIComponent(sp.return)}` : "";

  const errors = t.login.errors;
  const errorMessage = sp.error
    ? errors[sp.error as keyof typeof errors] ?? errors.default
    : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card card-hover-border w-full max-w-sm p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white">
          <DiscordIcon size={26} />
        </span>

        <h1 className="mt-5 text-xl font-semibold">{t.login.welcomeBack}</h1>
        <p className="mt-2 text-sm text-muted">{t.login.useDiscord}</p>

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
          {t.login.continueWithDiscord}
        </a>

        <p className="mt-5 text-xs text-faint">{t.login.accessNote}</p>
      </div>
    </main>
  );
}
