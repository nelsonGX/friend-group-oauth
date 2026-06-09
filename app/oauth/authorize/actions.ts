"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  buildClientRedirect,
  issueAuthorizationCode,
  validateAuthorizeRequest,
  type AuthorizeParams,
} from "@/lib/oauth";

/**
 * Consent submission handler. Re-validates the full request server-side (never
 * trusts the hidden fields), then issues a code on approval or bounces back
 * with access_denied otherwise.
 */
export async function decideAuthorization(formData: FormData) {
  const get = (k: string) => formData.get(k)?.toString() || undefined;
  const params: AuthorizeParams = {
    responseType: get("response_type"),
    clientId: get("client_id"),
    redirectUri: get("redirect_uri"),
    scope: get("scope"),
    codeChallenge: get("code_challenge"),
    codeChallengeMethod: get("code_challenge_method"),
  };
  const state = get("state");
  const approved = get("decision") === "approve";

  const result = await validateAuthorizeRequest(params);
  if (!result.ok) {
    if (result.error.kind === "render") {
      throw new Error(result.error.message);
    }
    redirect(
      buildClientRedirect(params.redirectUri!, {
        error: result.error.error,
        error_description: result.error.description,
        state,
      }),
    );
  }

  const user = await getCurrentUser();
  if (!user || !user.allowed || !approved) {
    redirect(
      buildClientRedirect(result.redirectUri, { error: "access_denied", state }),
    );
  }

  const code = await issueAuthorizationCode({
    clientId: result.client.clientId,
    userId: user.id,
    redirectUri: result.redirectUri,
    scope: result.scopes.join(" "),
    codeChallenge: params.codeChallenge!,
    codeChallengeMethod: params.codeChallengeMethod!,
  });
  redirect(buildClientRedirect(result.redirectUri, { code, state }));
}
