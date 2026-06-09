import { pollDeviceAuthorization } from "@/lib/devices";
import { env } from "@/lib/env";

/**
 * Poll a device authorization. The skill sends the `device_code` it received
 * from /start; while the user hasn't approved we return RFC 8628 status codes
 * (`authorization_pending`, `slow_down`). On approval we return the client
 * credentials exactly once, then the request is consumed.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request", error_description: "Body must be JSON." }, 400);
  }

  const deviceCode =
    typeof (body as Record<string, unknown>)?.device_code === "string"
      ? ((body as Record<string, unknown>).device_code as string)
      : "";

  const result = await pollDeviceAuthorization(deviceCode);

  switch (result.status) {
    case "pending":
      return json({ error: "authorization_pending" }, 400);
    case "slow_down":
      return json({ error: "slow_down" }, 400);
    case "denied":
      return json({ error: "access_denied" }, 400);
    case "expired":
      return json({ error: "expired_token" }, 400);
    case "invalid":
      return json({ error: "invalid_grant" }, 400);
    case "approved": {
      const c = result.credentials;
      return json(
        {
          client_id: c.clientId,
          client_secret: c.clientSecret,
          redirect_uris: c.redirectUris,
          scopes: c.scopes,
          app_url: env.APP_URL,
          discovery_url: `${env.APP_URL}/.well-known/oauth-authorization-server`,
        },
        200,
      );
    }
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
