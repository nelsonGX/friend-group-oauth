import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { sanitizeReturnPath } from "@/lib/url";
import { DiscordIcon } from "@/components/DiscordIcon";
import { PhoneHandoff } from "./PhoneHandoff";

export const metadata: Metadata = {
  title: "Log in | Friend Group Auth",
  description: "Sign in with Discord to use Friend Group Auth.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; error?: string }>;
}) {
  const [sp, user, { t }] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getDictionary(),
  ]);
  if (user) redirect(sanitizeReturnPath(sp.return));

  const query = sp.return ? `?return=${encodeURIComponent(sp.return)}` : "";

  // When the user landed here mid-flow (e.g. an app asked them to authorize),
  // offer a cross-device hand-off: show a QR they scan with a phone, approve
  // there, and this browser gets signed in. Skip it for a bare visit to /login
  // (nothing to continue), and for the phone leg of a hand-off itself (a return
  // back to /handoff/... — no point nesting another QR).
  const returnPath = sanitizeReturnPath(sp.return);
  const offerPhone = Boolean(sp.return) && !returnPath.startsWith("/handoff/");

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

        <form action={`/api/auth/discord/start${query}`} method="post">
          <button type="submit" className="btn btn-primary mt-6 w-full py-3">
            <DiscordIcon size={20} />
            {t.login.continueWithDiscord}
          </button>
        </form>

        {offerPhone && <PhoneHandoff returnPath={returnPath} t={t.login} />}

        <p className="mt-5 text-xs text-faint">{t.login.accessNote}</p>
      </div>
    </main>
  );
}
