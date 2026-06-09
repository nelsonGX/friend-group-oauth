import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Lazily-initialized Drizzle client over a node-postgres pool.
 *
 * Initialization is deferred until first use so `next build` never touches
 * DATABASE_URL. The pool is cached on globalThis to survive dev hot-reloads.
 */
const globalForDb = globalThis as unknown as {
  __pool?: Pool;
  __db?: NodePgDatabase<typeof schema>;
};

export function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb.__db) {
    globalForDb.__pool ??= new Pool({ connectionString: env.DATABASE_URL });
    globalForDb.__db = drizzle(globalForDb.__pool, { schema });
  }
  return globalForDb.__db;
}

/**
 * Inject a Drizzle instance for tests/verification (e.g. an in-process PGlite
 * database) so getDb() returns it instead of constructing a Postgres pool.
 * Typed as unknown because the PGlite driver yields a structurally-different
 * (but API-compatible) Drizzle instance.
 */
export function setDatabaseForTesting(database: unknown): void {
  globalForDb.__db = database as NodePgDatabase<typeof schema>;
}

export { schema };
export type Database = NodePgDatabase<typeof schema>;
