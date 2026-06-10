import { env } from "@/lib/env";
import { SUPPORTED_SCOPES } from "@/lib/oauth";

const TOKEN_ENDPOINT_AUTH_METHODS = [
  "client_secret_basic",
  "client_secret_post",
] as const;

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
      token_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
      revocation_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
      service_documentation: `${base}/docs/INTEGRATION.md`,

      // Extension: the credit/payment flow (not part of RFC 8414).
      payment_intent_endpoint: `${base}/api/pay/intent`,
      payment_confirmation_endpoint: `${base}/pay`,
      payment_verify_endpoint: `${base}/api/pay/verify`,

      // Extension: browser-approved device flow for skill-driven app registration.
      device_authorization_endpoint: `${base}/api/manage/device/start`,
      device_poll_endpoint: `${base}/api/manage/device/poll`,
      device_verification_uri: `${base}/device`,

      // Extension: hosted JSON data store (client-authenticated, server-to-server).
      data_get_endpoint: `${base}/api/data/get`,
      data_set_endpoint: `${base}/api/data/set`,
      data_delete_endpoint: `${base}/api/data/delete`,
      data_list_endpoint: `${base}/api/data/list`,
    },
    {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/json",
      },
    },
  );
}
