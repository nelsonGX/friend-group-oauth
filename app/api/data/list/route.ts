import { authedJson, badRequest, json } from "@/lib/data-api";
import { listData, resolveScope } from "@/lib/data";

/**
 * List entries in a scope, ordered by key. Client-authenticated. Body:
 * { scope: "user"|"app", user_id?, prefix?, limit?, cursor? }. Returns
 * { entries: [{ key, value, updated_at }], next_cursor }. Pass `next_cursor`
 * back as `cursor` for the next page (null when exhausted).
 */
export async function POST(request: Request) {
  const auth = await authedJson(request);
  if (!auth.ok) return auth.response;
  const { body, client } = auth;

  const scope = resolveScope(client.id, body.scope, body.user_id);
  if (!scope.ok) return badRequest(scope.message);

  const prefix = typeof body.prefix === "string" ? body.prefix : undefined;
  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;

  let limit: number | undefined;
  if (body.limit !== undefined) {
    if (
      typeof body.limit !== "number" ||
      !Number.isInteger(body.limit) ||
      body.limit <= 0
    ) {
      return badRequest("limit must be a positive integer.");
    }
    limit = body.limit;
  }

  const { entries, nextCursor } = await listData(scope.scope, {
    prefix,
    limit,
    cursor,
  });
  return json({
    entries: entries.map((e) => ({
      key: e.key,
      value: e.value,
      updated_at: e.updatedAt,
    })),
    next_cursor: nextCursor,
  });
}
