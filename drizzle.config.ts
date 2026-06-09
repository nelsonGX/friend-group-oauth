import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit config. `generate` (producing SQL from the schema) needs no live
 * database; `migrate`/`push` use DATABASE_URL. The fallback URL only exists so
 * `generate` works in environments without the var set.
 */
export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://oauth:password@localhost:5432/friend_oauth",
  },
} satisfies Config;
