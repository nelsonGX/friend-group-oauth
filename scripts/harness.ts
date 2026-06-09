import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import * as schema from "../db/schema";
import { setDatabaseForTesting } from "../db";

/**
 * Verification harness: spins up an in-process PGlite Postgres, applies the
 * generated migrations, and wires it in as the app's database so the real
 * lib/* functions run against it. Lets us verify auth/credit invariants with
 * zero external Postgres.
 */
export async function createTestDb() {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  const files = readdirSync("db/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = readFileSync(`db/migrations/${f}`, "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  setDatabaseForTesting(db);
  return db;
}

let passed = 0;
let failed = 0;

export function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

export function summarize() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

export { schema };
