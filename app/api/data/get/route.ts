import { authedJson, badRequest, json } from "@/lib/data-api";
import { getData, resolveScope, validateKey } from "@/lib/data";

/**
 * Fetch one JSON value from an app's data store. Client-authenticated (Basic or
 * client_id/client_secret in the body). Body: { scope: "user"|"app", user_id?,
 * key }. Returns { key, value, found } — `value` is null when not found.
 */
export async function POST(request: Request) {
  const auth = await authedJson(request);
  if (!auth.ok) return auth.response;
  const { body, client } = auth;

  const scope = resolveScope(client.id, body.scope, body.user_id);
  if (!scope.ok) return badRequest(scope.message);

  const keyError = validateKey(body.key);
  if (keyError) return badRequest(keyError);
  const key = body.key as string;

  const result = await getData(scope.scope, key);
  return json({ key, value: result ? result.value : null, found: result !== null });
}
