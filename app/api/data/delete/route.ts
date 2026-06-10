import { authedJson, badRequest, json } from "@/lib/data-api";
import { deleteData, resolveScope, validateKey } from "@/lib/data";

/**
 * Delete one key from an app's data store. Client-authenticated. Body:
 * { scope: "user"|"app", user_id?, key }. Returns { key, deleted } — `deleted`
 * is false when no such key existed (idempotent).
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

  const deleted = await deleteData(scope.scope, key);
  return json({ key, deleted });
}
