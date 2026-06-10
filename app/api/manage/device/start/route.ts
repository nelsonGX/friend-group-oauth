import { startDeviceAuthorization, deviceEndpoints } from "@/lib/devices";

/**
 * Begin a browser-approved device authorization. A coding-agent skill POSTs the
 * proposed app registration (JSON); we return a `device_code` to poll with and a
 * `user_code` + verification URL to send the user to. No client auth — the
 * request is just a proposal the user must approve in the browser.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request", error_description: "Body must be JSON." }, 400);
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name : "";
  const redirectUris = toList(b.redirect_uris);
  const scopes = toList(b.scopes);

  const result = await startDeviceAuthorization({ name, redirectUris, scopes });
  if (!result.ok) {
    return json({ error: result.error, error_description: result.errorDescription }, 400);
  }

  const { verificationUri } = deviceEndpoints();
  return json(
    {
      device_code: result.deviceCode,
      user_code: result.userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?code=${encodeURIComponent(result.userCode)}`,
      expires_in: result.expiresIn,
      interval: result.interval,
    },
    200,
  );
}

/** Accept either an array of strings or a space/comma-separated string. */
function toList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v) => {
      const item = String(v).trim();
      return item ? [item] : [];
    });
  }
  if (typeof value === "string") {
    return value.split(/[\s,]+/).flatMap((s) => {
      const item = s.trim();
      return item ? [item] : [];
    });
  }
  return [];
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
