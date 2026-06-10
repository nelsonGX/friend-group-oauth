import { authedJson, badRequest, json } from "@/lib/data-api";
import {
  FK_VIOLATION,
  resolveScope,
  setData,
  validateKey,
  validateValueSize,
} from "@/lib/data";

/**
 * Store one JSON value in an app's data store (upsert, last-write-wins).
 * Client-authenticated. Body: { scope: "user"|"app", user_id?, key, value }.
 * `value` may be any JSON, including `null`. Returns { key, ok, updated_at }.
 */
export async function POST(request: Request) {
  const auth = await authedJson(request);
  if (!auth.ok) return auth.response;
  const { body, client } = auth;

  const scope = resolveScope(client.id, body.scope, body.user_id);
  if (!scope.ok) return badRequest(scope.message);

  const keyError = validateKey(body.key);
  if (keyError) return badRequest(keyError);

  if (!("value" in body)) return badRequest("value is required.");
  const sizeError = validateValueSize(body.value);
  if (sizeError) return badRequest(sizeError);

  const key = body.key as string;
  try {
    const { updatedAt } = await setData(scope.scope, key, body.value);
    return json({ key, ok: true, updated_at: updatedAt });
  } catch (err) {
    // A well-formed user_id that references no user surfaces as a FK violation.
    if ((err as { code?: string })?.code === FK_VIOLATION) {
      return badRequest("Unknown user_id.");
    }
    throw err;
  }
}
