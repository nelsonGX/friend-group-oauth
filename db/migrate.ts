import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Apply pending SQL migrations from db/migrations to DATABASE_URL.
 * Run with: npm run db:migrate
 */
async function main() {
  // Node loads .env automatically only with --env-file; load it here for convenience.
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env file — rely on the ambient environment
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./db/migrations" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
