import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  buildClientRedirect,
  issueAuthorizationCode,
  validateAuthorizeRequest,
  type AuthorizeParams,
} from "@/lib/oauth";
import { decideAuthorization } from "./actions";

const SCOPE_LABELS: Record<string, string> = {
  identify: "Your Discord identity (username, avatar)",
  roles: "Your server roles and access status",
  credits: "Your credit balance",
};

function ErrorView({ message }: { message: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="reveal card w-full max-w-md border-danger/30 p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 8v5m0 3.5h.01M10.3 3.9L2.4 18a1.9 1.9 0 001.7 2.9h15.8a1.9 1.9 0 001.7-2.9L13.7 3.9a1.9 1.9 0 00-3.4 0z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h1 className="mt-4 text-lg font-semibold text-danger">
          Authorization error
        </h1>
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
      return <ErrorView message={result.error.message} />;
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
      <ErrorView message="You don't have access to this platform yet. Make sure you're in the Discord server with the required role." />
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
      <div className="reveal card w-full max-w-md p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-soft to-violet text-white shadow-[0_12px_30px_-12px_rgba(88,101,242,0.9)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 2.5l8 4v5c0 4.6-3.1 8.4-8 10-4.9-1.6-8-5.4-8-10v-5l8-4z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">
              Authorize access
            </p>
            <h1 className="text-xl font-semibold leading-tight">{client.name}</h1>
          </div>
        </div>

        <p className="mt-5 text-sm text-muted">
          Signed in as{" "}
          <span className="font-medium text-ink">
            {user.globalName ?? user.username}
          </span>
          . <span className="font-medium text-ink">{client.name}</span> would
          like to access:
        </p>

        <ul className="mt-4 space-y-2">
          {scopes.map((s) => (
            <li
              key={s}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand-soft">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M5 12.5l4.5 4.5L19 6.5"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>{SCOPE_LABELS[s] ?? s}</span>
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
            Deny
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="btn btn-primary flex-1"
          >
            Approve
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">
          You can revoke this access anytime from your dashboard.
        </p>
      </div>
    </main>
  );
}
