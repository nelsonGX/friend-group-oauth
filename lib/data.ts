import { and, asc, eq, gt, isNull, like, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appData, users } from "@/db/schema";

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

// --- Owner-facing reads (the dashboard data viewer) ---------------------------
// These browse an app's whole store across users, so they take the client's
// uuid directly (an app owns its data) rather than a scope the app supplies.

export const OWNER_LIST_DEFAULT = 50;
export const OWNER_LIST_MAX = 200;

export interface AppDataStats {
  /** Number of app-global keys. */
  appKeys: number;
  /** Number of per-user keys across all users. */
  userKeys: number;
  /** Distinct users that have per-user data. */
  users: number;
}

export interface OwnerDataEntry {
  key: string;
  value: unknown;
  updatedAt: Date;
  /** null for app-global rows; the owning user's id for per-user rows. */
  userId: string | null;
  username: string | null;
  globalName: string | null;
}

/** Counts for the data-viewer header. */
export async function getAppDataStats(clientId: string): Promise<AppDataStats> {
  const db = getDb();
  const [appRow] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(appData)
    .where(and(eq(appData.clientId, clientId), isNull(appData.userId)));
  const [userRow] = await db
    .select({
      n: sql<number>`cast(count(*) as int)`,
      u: sql<number>`cast(count(distinct ${appData.userId}) as int)`,
    })
    .from(appData)
    .where(and(eq(appData.clientId, clientId), sql`${appData.userId} is not null`));
  return {
    appKeys: appRow?.n ?? 0,
    userKeys: userRow?.n ?? 0,
    users: userRow?.u ?? 0,
  };
}

/** Opaque keyset cursor: the last (user, key) seen, base64url-encoded JSON. */
function encodeCursor(c: { u: string | null; k: string }): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(s: string): { u: string | null; k: string } | null {
  try {
    const o = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (
      o &&
      typeof o.k === "string" &&
      (o.u === null || (typeof o.u === "string" && UUID_RE.test(o.u)))
    ) {
      return o as { u: string | null; k: string };
    }
  } catch {
    // fall through
  }
  return null;
}

function clampOwnerLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isInteger(raw) || raw <= 0) {
    return OWNER_LIST_DEFAULT;
  }
  return Math.min(raw, OWNER_LIST_MAX);
}

/**
 * Browse an app's stored data for its owner. `scope: "app"` lists app-global
 * keys (ordered by key); `scope: "user"` lists every per-user key joined to the
 * owning user for display, ordered by (user, key). Both keyset-paginate via the
 * opaque `cursor`/`nextCursor`, and `prefix` filters keys by literal prefix.
 */
export async function listAppDataForOwner(
  clientId: string,
  opts: {
    scope: "app" | "user";
    prefix?: string;
    limit?: number;
    cursor?: string;
  },
): Promise<{ entries: OwnerDataEntry[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = clampOwnerLimit(opts.limit);
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  const prefixCond = opts.prefix
    ? like(appData.key, `${escapeLikePrefix(opts.prefix)}%`)
    : undefined;

  if (opts.scope === "app") {
    const conds = [eq(appData.clientId, clientId), isNull(appData.userId)];
    if (prefixCond) conds.push(prefixCond);
    if (cursor) conds.push(gt(appData.key, cursor.k));
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
        userId: null,
        username: null,
        globalName: null,
      })),
      nextCursor: hasMore
        ? encodeCursor({ u: null, k: page[page.length - 1].key })
        : null,
    };
  }

  const conds = [eq(appData.clientId, clientId), sql`${appData.userId} is not null`];
  if (prefixCond) conds.push(prefixCond);
  // Composite keyset over (user_id, key); cast the cursor user id to uuid so the
  // row comparison is well-typed.
  if (cursor && cursor.u) {
    conds.push(
      sql`(${appData.userId}, ${appData.key}) > (${cursor.u}::uuid, ${cursor.k})`,
    );
  }
  const rows = await db
    .select({
      key: appData.key,
      value: appData.value,
      updatedAt: appData.updatedAt,
      userId: appData.userId,
      username: users.username,
      globalName: users.globalName,
    })
    .from(appData)
    .leftJoin(users, eq(users.id, appData.userId))
    .where(and(...conds))
    .orderBy(asc(appData.userId), asc(appData.key))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries: page.map((r) => ({
      key: r.key,
      value: (r.value as Envelope).v,
      updatedAt: r.updatedAt,
      userId: r.userId,
      username: r.username,
      globalName: r.globalName,
    })),
    nextCursor: hasMore
      ? encodeCursor({
          u: page[page.length - 1].userId,
          k: page[page.length - 1].key,
        })
      : null,
  };
}
