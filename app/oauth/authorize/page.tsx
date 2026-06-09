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
      <div className="w-full max-w-md rounded-xl border border-red-500/30 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-600 dark:text-red-400">
          Authorization error
        </h1>
        <p className="mt-2 text-sm opacity-80">{message}</p>
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
      <div className="w-full max-w-md rounded-xl border border-black/10 dark:border-white/15 p-8">
        <h1 className="text-xl font-semibold">Authorize {client.name}</h1>
        <p className="mt-2 text-sm opacity-70">
          Signed in as{" "}
          <span className="font-medium">
            {user.globalName ?? user.username}
          </span>
          . <span className="font-medium">{client.name}</span> wants to access:
        </p>

        <ul className="mt-4 space-y-2 text-sm">
          {scopes.map((s) => (
            <li key={s} className="flex items-start gap-2">
              <span aria-hidden>•</span>
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
            className="flex-1 rounded-md border border-black/15 dark:border-white/20 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            Deny
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="flex-1 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4752c4]"
          >
            Approve
          </button>
        </form>
      </div>
    </main>
  );
}
