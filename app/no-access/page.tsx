import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import { DiscordIcon } from "@/components/DiscordIcon";

/**
 * Full-screen gate for a signed-in user who isn't a member of the group's
 * Discord server. There's nothing in the app for them, so instead of the normal
 * member UI we explain the situation and prompt them to switch accounts (which
 * forces Discord's authorization screen, where they can pick a different one).
 */
export default async function NoAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Members who are actually in the server don't belong on this screen.
  if (user.inGuild) redirect("/explore");

  const { t } = await getDictionary();
  const g = t.gate;
  const name = user.globalName ?? user.username;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal w-full max-w-lg text-center">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-danger/10 text-danger">
          <UserX size={40} />
        </span>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          {g.notInGuildTitle}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted">{g.notInGuildMessage}</p>

        {/* Which account they're currently signed in as. */}
        <div className="mt-8 inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 py-1.5">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
              alt=""
              className="h-6 w-6 rounded-full ring-1 ring-border"
            />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="text-sm text-muted">
            {format(g.signedInAs, { name })}
          </span>
        </div>

        <div className="mx-auto mt-8 flex w-full max-w-xs flex-col items-stretch gap-3">
          <a
            href="/api/auth/discord/start?prompt=consent"
            className="btn btn-primary w-full py-3"
          >
            <DiscordIcon size={18} />
            {g.switchAccount}
          </a>
          <form action="/api/auth/logout" method="post" className="w-full">
            <button className="btn btn-ghost w-full py-2.5">{g.logOut}</button>
          </form>
        </div>

        <p className="mx-auto mt-7 max-w-sm text-xs text-faint">{g.joinHint}</p>
      </div>
    </main>
  );
}
