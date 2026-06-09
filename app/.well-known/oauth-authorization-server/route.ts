import { env } from "@/lib/env";
import { SUPPORTED_SCOPES } from "@/lib/oauth";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Lets integrators configure from one URL instead of transcribing endpoints,
 * and removes the `/oauth/authorize` vs `/api/oauth/*` prefix confusion. The
 * `payment_*` fields are a non-standard extension documenting the credit/pay
 * flow that lives alongside the standard OAuth endpoints.
 */
export async function GET() {
  const base = env.APP_URL;
  const authMethods = ["client_secret_basic", "client_secret_post"];

  return Response.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      userinfo_endpoint: `${base}/api/oauth/userinfo`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      scopes_supported: [...SUPPORTED_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: authMethods,
      revocation_endpoint_auth_methods_supported: authMethods,
      service_documentation: `${base}/docs/INTEGRATION.md`,

      // Extension: the credit/payment flow (not part of RFC 8414).
      payment_intent_endpoint: `${base}/api/pay/intent`,
      payment_confirmation_endpoint: `${base}/pay`,
      payment_verify_endpoint: `${base}/api/pay/verify`,
    },
    {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/json",
      },
    },
  );
}
