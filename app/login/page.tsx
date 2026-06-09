import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { sanitizeReturnPath } from "@/lib/url";
import { env } from "@/lib/env";
import { qrSvg } from "@/lib/qr";
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

  // When the user landed here mid-flow (e.g. an app asked them to authorize),
  // offer a hand-off to their phone: a QR of the same destination, which they
  // can finish on a device where they're already signed in. Skip it for a bare
  // visit to /login, where there's nothing in particular to continue.
  const phoneQr = sp.return
    ? await qrSvg(`${env.APP_URL}${sanitizeReturnPath(sp.return)}`)
    : null;

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

        {phoneQr && (
          <div className="mt-7">
            <div className="flex items-center gap-3 text-faint">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide">
                {t.login.continueOnPhone}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="mt-4 flex flex-col items-center gap-3">
              <div
                className="rounded-xl bg-white p-3 ring-1 ring-border [&>svg]:block [&>svg]:h-40 [&>svg]:w-40"
                // QR SVG is generated server-side from our own URL — trusted markup.
                dangerouslySetInnerHTML={{ __html: phoneQr }}
              />
              <p className="text-xs text-faint">{t.login.phoneHint}</p>
            </div>
          </div>
        )}

        <p className="mt-5 text-xs text-faint">{t.login.accessNote}</p>
      </div>
    </main>
  );
}
