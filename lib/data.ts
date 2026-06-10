import { and, asc, eq, gt, isNull, like, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appData } from "@/db/schema";

/**
 * Hosted JSON key–value store for provider apps ("database as a service"). Pure
 * data access over {@link getDb}; the HTTP layer in app/api/data/* handles auth,
 * parsing, and status codes. See {@link appData} for the table and its two
 * scopes (app-global vs per-user).
 *
 * Values are stored inside a `{ v: <value> }` envelope rather than bare in the
 * jsonb column. The column is NOT NULL, but Drizzle encodes a top-level JS `null`
 * as SQL NULL (it skips the jsonb encoder for null) — so a bare `null` value
 * could neither be stored nor distinguished from "no row". Wrapping makes the
 * stored value always a non-null object, so any JSON (including `null`) round-
 * trips and "row exists" unambiguously means "found".
 */

export const MAX_KEY_LENGTH = 256;
/** Max size of a single value, measured as its UTF-8 JSON encoding. */
export const MAX_VALUE_BYTES = 256 * 1024;
export const LIST_DEFAULT_LIMIT = 100;
export const LIST_MAX_LIMIT = 1000;

/** A namespace within an app's store: `userId === null` is app-global. */
export interface DataScope {
  clientId: string;
  userId: string | null;
}

interface Envelope {
  v: unknown;
}

export interface DataEntry {
  key: string;
  value: unknown;
  updatedAt: Date;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build the WHERE that pins a row to one scope (app-global or one user). */
function scopeWhere(scope: DataScope) {
  return scope.userId === null
    ? and(eq(appData.clientId, scope.clientId), isNull(appData.userId))
    : and(
        eq(appData.clientId, scope.clientId),
        eq(appData.userId, scope.userId),
      );
}

/**
 * Resolve a request's `scope`/`user_id` into a {@link DataScope}, or an error
 * message for a 400. `user` requires a well-formed user id (UUID) so a bad id
 * fails fast here instead of as a database error; `app` must omit `user_id`.
 */
export function resolveScope(
  clientId: string,
  rawScope: unknown,
  rawUserId: unknown,
): { ok: true; scope: DataScope } | { ok: false; message: string } {
  if (rawScope === "app") {
    if (rawUserId !== undefined && rawUserId !== null && rawUserId !== "") {
      return { ok: false, message: 'scope "app" must not include user_id.' };
    }
    return { ok: true, scope: { clientId, userId: null } };
  }
  if (rawScope === "user") {
    if (typeof rawUserId !== "string" || !UUID_RE.test(rawUserId)) {
      return {
        ok: false,
        message: 'scope "user" requires user_id to be a valid user id (UUID).',
      };
    }
    return { ok: true, scope: { clientId, userId: rawUserId } };
  }
  return { ok: false, message: 'scope must be "user" or "app".' };
}

/** Validate a key. Returns an error message, or null if the key is acceptable. */
export function validateKey(key: unknown): string | null {
  if (typeof key !== "string" || key.length === 0) return "key is required.";
  if (key.length > MAX_KEY_LENGTH) {
    return `key must be at most ${MAX_KEY_LENGTH} characters.`;
  }
  return null;
}

/** Validate a value's JSON-encoded size. Returns an error message, or null. */
export function validateValueSize(value: unknown): string | null {
  const json = JSON.stringify(value ?? null);
  if (json === undefined) return "value must be JSON-serializable.";
  if (Buffer.byteLength(json, "utf8") > MAX_VALUE_BYTES) {
    return `value must be at most ${MAX_VALUE_BYTES} bytes when JSON-encoded.`;
  }
  return null;
}

/** Postgres error code raised when user_id references a non-existent user. */
export const FK_VIOLATION = "23503";

/** Fetch one value, or null if no row exists in the scope for that key. */
export async function getData(
  scope: DataScope,
  key: string,
): Promise<{ value: unknown } | null> {
  const db = getDb();
  const [row] = await db
    .select({ value: appData.value })
    .from(appData)
    .where(and(scopeWhere(scope), eq(appData.key, key)))
    .limit(1);
  if (!row) return null;
  return { value: (row.value as Envelope).v };
}

/**
 * Upsert a value (last-write-wins). Atomic via ON CONFLICT against the partial
 * unique index for the scope — the conflict target switches on whether this is
 * an app-global or per-user write so it matches the right index.
 */
export async function setData(
  scope: DataScope,
  key: string,
  value: unknown,
): Promise<{ updatedAt: Date }> {
  const db = getDb();
  const now = new Date();
  const envelope: Envelope = { v: value };
  const [row] = await db
    .insert(appData)
    .values({
      clientId: scope.clientId,
      userId: scope.userId,
      key,
      value: envelope,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target:
        scope.userId === null
          ? [appData.clientId, appData.key]
          : [appData.clientId, appData.userId, appData.key],
      targetWhere:
        scope.userId === null
          ? sql`${appData.userId} is null`
          : sql`${appData.userId} is not null`,
      set: { value: envelope, updatedAt: now },
    })
    .returning({ updatedAt: appData.updatedAt });
  return { updatedAt: row.updatedAt };
}

/** Delete one key. Returns true if a row was removed, false if none existed. */
export async function deleteData(
  scope: DataScope,
  key: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(appData)
    .where(and(scopeWhere(scope), eq(appData.key, key)))
    .returning({ id: appData.id });
  return rows.length > 0;
}

/** Escape LIKE wildcards so a prefix matches literally (default `\` escape). */
function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isInteger(raw) || raw <= 0) {
    return LIST_DEFAULT_LIMIT;
  }
  return Math.min(raw, LIST_MAX_LIMIT);
}

/**
 * List entries in a scope, ordered by key. Keyset-paginated: pass the returned
 * `nextCursor` back as `cursor` to fetch the next page (null when exhausted).
 * `prefix` filters keys by literal prefix.
 */
export async function listData(
  scope: DataScope,
  opts: { prefix?: string; limit?: number; cursor?: string } = {},
): Promise<{ entries: DataEntry[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = clampLimit(opts.limit);

  const conds = [scopeWhere(scope)];
  if (opts.prefix) {
    conds.push(like(appData.key, `${escapeLikePrefix(opts.prefix)}%`));
  }
  if (opts.cursor) conds.push(gt(appData.key, opts.cursor));

  const rows = await db
    .select({
      key: appData.key,
      value: appData.value,
      updatedAt: appData.updatedAt,
    })
    .from(appData)
    .where(and(...conds))
    .orderBy(asc(appData.key))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries: page.map((r) => ({
      key: r.key,
      value: (r.value as Envelope).v,
      updatedAt: r.updatedAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].key : null,
  };
}
