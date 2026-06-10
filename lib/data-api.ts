import { authenticateClient, getClientCredentialsJson } from "@/lib/oauth";
import type { Client } from "@/db/schema";

/**
 * HTTP helpers shared by the app/api/data/* route handlers: JSON responses and
 * the common "parse a JSON body + authenticate the client" step. Kept out of
 * lib/data.ts so that module stays a pure data-access layer.
 */

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function badRequest(description: string) {
  return json({ error: "invalid_request", error_description: description }, 400);
}

/**
 * Parse the request's JSON body and authenticate the client (HTTP Basic or
 * `client_id`/`client_secret` in the body). Returns the parsed object and the
 * client, or a ready-to-return error Response.
 */
export async function authedJson(
  request: Request,
): Promise<
  | { ok: true; body: Record<string, unknown>; client: Client }
  | { ok: false; response: Response }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: badRequest("Body must be JSON.") };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, response: badRequest("Body must be a JSON object.") };
  }

  const b = body as Record<string, unknown>;
  const creds = getClientCredentialsJson(request, b);
  const client = await authenticateClient(creds.clientId, creds.clientSecret);
  if (!client) {
    return {
      ok: false,
      response: Response.json(
        {
          error: "invalid_client",
          error_description: "Client authentication failed.",
        },
        {
          status: 401,
          headers: {
            "cache-control": "no-store",
            "www-authenticate": "Basic",
          },
        },
      ),
    };
  }
  return { ok: true, body: b, client };
}
