import {
  authenticateClient,
  getClientCredentials,
  redeemAuthorizationCode,
  rotateRefreshToken,
} from "@/lib/oauth";

/** OAuth2 token endpoint: authorization_code and refresh_token grants. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("invalid_request", "Expected form-encoded body.", 400);
  }

  const creds = getClientCredentials(request, form);
  const client = await authenticateClient(creds.clientId, creds.clientSecret);
  if (!client) {
    return error("invalid_client", "Client authentication failed.", 401);
  }

  const grantType = form.get("grant_type")?.toString();

  if (grantType === "authorization_code") {
    const code = form.get("code")?.toString();
    const redirectUri = form.get("redirect_uri")?.toString();
    const codeVerifier = form.get("code_verifier")?.toString();
    if (!code || !redirectUri || !codeVerifier) {
      return error(
        "invalid_request",
        "code, redirect_uri, and code_verifier are required.",
        400,
      );
    }
    const result = await redeemAuthorizationCode({
      client,
      code,
      redirectUri,
      codeVerifier,
    });
    if (!result.ok) return error("invalid_grant", result.description, 400);
    return success(result.tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token")?.toString();
    if (!refreshToken) {
      return error("invalid_request", "refresh_token is required.", 400);
    }
    const result = await rotateRefreshToken({ client, refreshToken });
    if (!result.ok) return error("invalid_grant", result.description, 400);
    return success(result.tokens);
  }

  return error("unsupported_grant_type", `Unsupported grant_type.`, 400);
}

function success(body: unknown) {
  return Response.json(body, {
    headers: { "cache-control": "no-store", pragma: "no-cache" },
  });
}

function error(error: string, description: string, status: number) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "cache-control": "no-store" } },
  );
}
