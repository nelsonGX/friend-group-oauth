import { redirect } from "next/navigation";
import { TriangleAlert, ShieldCheck, Check, X } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import {
  buildClientRedirect,
  issueAuthorizationCode,
  validateAuthorizeRequest,
  type AuthorizeParams,
} from "@/lib/oauth";
import { decideAuthorization } from "./actions";

function ErrorView({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card card-hover w-full max-w-md border-danger/30 p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
          <TriangleAlert size={24} strokeWidth={1.7} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-danger">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { t } = await getDictionary();
  const scopeLabels: Record<string, string> = t.authorize.scopes;
  const str = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const params: AuthorizeParams = {
    responseType: str(sp.response_type),
    clientId: str(sp.client_id),
    redirectUri: str(sp.redirect_uri),
    scope: str(sp.scope),
    codeChallenge: str(sp.code_challenge),
    codeChallengeMethod: str(sp.code_challenge_method),
  };
  const state = str(sp.state);

  const result = await validateAuthorizeRequest(params);
  if (!result.ok) {
    if (result.error.kind === "render") {
      const errs = t.authorize.renderErrors;
      const code = result.error.code;
      const message = code && code in errs ? errs[code as keyof typeof errs] : result.error.message;
      return <ErrorView title={t.authorize.error} message={message} />;
    }
    redirect(
      buildClientRedirect(params.redirectUri!, {
        error: result.error.error,
        error_description: result.error.description,
        state,
      }),
    );
  }

  const { client, scopes, redirectUri } = result;

  // Require a logged-in session; return here after Discord login.
  const user = await getCurrentUser();
  if (!user) {
    const self = new URLSearchParams();
    self.set("response_type", params.responseType!);
    self.set("client_id", params.clientId!);
    self.set("redirect_uri", params.redirectUri!);
    self.set("scope", scopes.join(" "));
    self.set("code_challenge", params.codeChallenge!);
    self.set("code_challenge_method", params.codeChallengeMethod!);
    if (state) self.set("state", state);
    redirect(
      `/login?return=${encodeURIComponent(`/oauth/authorize?${self.toString()}`)}`,
    );
  }

  if (!user.allowed) {
    return (
      <ErrorView title={t.authorize.error} message={t.authorize.noAccessMessage} />
    );
  }

  // Trusted clients skip consent.
  if (client.trusted) {
    const code = await issueAuthorizationCode({
      clientId: client.clientId,
      userId: user.id,
      redirectUri,
      scope: scopes.join(" "),
      codeChallenge: params.codeChallenge!,
      codeChallengeMethod: params.codeChallengeMethod!,
    });
    redirect(buildClientRedirect(redirectUri, { code, state }));
  }

  const displayName = user.globalName ?? user.username;
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
    : null;
  const { jokes } = t.authorize;
  const joke = jokes[Math.floor(Math.random() * jokes.length)];

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card w-full max-w-md p-8">
        {/* Connected identities — the app icon and the signed-in user, linked. */}
        <div className="flex items-center justify-center gap-4">
          {client.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.iconUrl}
              alt=""
              className="h-[68px] w-[68px] rounded-2xl object-cover ring-2 ring-border"
            />
          ) : (
            <span className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-2xl bg-brand text-white">
              <ShieldCheck size={30} strokeWidth={1.7} />
            </span>
          )}
          <div className="flex items-center gap-1.5 text-faint" aria-hidden>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          </div>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-[68px] w-[68px] rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <span className="grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full bg-surface-strong text-2xl font-semibold text-ink ring-2 ring-border">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs uppercase tracking-wide text-faint">
            {t.authorize.authorizeAccess}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">
            {client.name}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {t.authorize.signedInAsPre}{" "}
            <span className="font-medium text-ink">{displayName}</span>
          </p>
        </div>

        <p className="mt-6 text-sm font-medium text-ink">
          <span className="text-brand-soft">{client.name}</span>{" "}
          {t.authorize.wouldLikeToAccess}
        </p>

        <ul className="mt-3 space-y-2">
          {scopes.map((s) => (
            <li
              key={s}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                <Check size={12} strokeWidth={2.6} />
              </span>
              <span>{scopeLabels[s] ?? s}</span>
            </li>
          ))}
          <li className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-surface px-3 py-2.5 text-sm">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-danger/15 text-danger">
              <X size={12} strokeWidth={2.6} />
            </span>
            <span className="italic text-faint">{joke}</span>
          </li>
        </ul>

        <form action={decideAuthorization} className="mt-6 flex gap-3">
          <input type="hidden" name="response_type" value={params.responseType} />
          <input type="hidden" name="client_id" value={params.clientId} />
          <input type="hidden" name="redirect_uri" value={params.redirectUri} />
          <input type="hidden" name="scope" value={scopes.join(" ")} />
          <input type="hidden" name="code_challenge" value={params.codeChallenge} />
          <input
            type="hidden"
            name="code_challenge_method"
            value={params.codeChallengeMethod}
          />
          {state && <input type="hidden" name="state" value={state} />}
          <button
            type="submit"
            name="decision"
            value="deny"
            className="btn btn-ghost flex-1"
          >
            {t.authorize.deny}
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="btn btn-primary flex-[1.6]"
          >
            {t.authorize.approve}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">
          {t.authorize.revokeNote}
        </p>
      </div>
    </main>
  );
}
