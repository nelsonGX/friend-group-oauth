import { redirect } from "next/navigation";
import { TriangleAlert, ShieldCheck, Check } from "lucide-react";
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

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card card-hover-border w-full max-w-md p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
            <ShieldCheck size={22} strokeWidth={1.7} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">
              {t.authorize.authorizeAccess}
            </p>
            <h1 className="text-xl font-semibold leading-tight">{client.name}</h1>
          </div>
        </div>

        <p className="mt-5 text-sm text-muted">
          {t.authorize.signedInAsPre}{" "}
          <span className="font-medium text-ink">
            {user.globalName ?? user.username}
          </span>
          . <span className="font-medium text-ink">{client.name}</span>{" "}
          {t.authorize.wouldLikeToAccess}
        </p>

        <ul className="mt-4 space-y-2">
          {scopes.map((s) => (
            <li
              key={s}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand-soft">
                <Check size={12} strokeWidth={2.4} />
              </span>
              <span>{scopeLabels[s] ?? s}</span>
            </li>
          ))}
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
            className="btn btn-primary flex-1"
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
