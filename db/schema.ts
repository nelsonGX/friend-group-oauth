import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Schema for the friend-group OAuth + credits server.
 *
 * Two OAuth layers live here:
 *  - upstream: we are a client of Discord (used only at login)
 *  - downstream: we are an OAuth2 provider to friends' sites ("clients")
 *
 * Credits are an append-only `ledger`: a balance is SUM(delta), never a mutable
 * column. Tokens and auth codes are stored hashed so a DB leak can't be replayed.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

/** A person, identified by their Discord account. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  globalName: text("global_name"),
  avatar: text("avatar"),
  isAdmin: boolean("is_admin").notNull().default(false),
  /** Whether the user is currently a member of the configured guild. */
  inGuild: boolean("in_guild").notNull().default(false),
  /** Whether the user holds a required role (or membership-only gating passes). */
  allowed: boolean("allowed").notNull().default(false),
  /** Snapshot of the user's role IDs at last check. */
  roles: jsonb("roles").$type<string[]>().notNull().default([]),
  lastRoleCheck: timestamp("last_role_check", { withTimezone: true }),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  ...timestamps,
});

/** A login session for this server's own UI. The cookie holds the signed id. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/** A friend's site: both an OAuth2 client and a credit-charging provider. */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Public client identifier handed to the provider. */
  clientId: text("client_id").notNull().unique(),
  /** Hash of the client secret (never stored in plaintext). */
  clientSecretHash: text("client_secret_hash").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull().default([]),
  allowedScopes: jsonb("allowed_scopes")
    .$type<string[]>()
    .notNull()
    .default(["identify"]),
  /** Trusted clients skip the consent screen. */
  trusted: boolean("trusted").notNull().default(false),
  ownerUserId: uuid("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  /** Optional server-to-server webhook for payment state changes. */
  webhookUrl: text("webhook_url"),
  /** Plaintext HMAC signing key for webhook payloads (a low-sensitivity key,
   *  separate from client_secret; shown once when the webhook is configured). */
  webhookSecret: text("webhook_secret"),
  ...timestamps,
});

/** Short-lived authorization codes (PKCE) exchanged at the token endpoint. */
export const authorizationCodes = pgTable(
  "authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    scope: text("scope").notNull(),
    codeChallenge: text("code_challenge"),
    codeChallengeMethod: text("code_challenge_method"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    used: boolean("used").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("authorization_codes_user_id_idx").on(t.userId)],
);

/** Opaque bearer tokens issued to clients; stored hashed for instant revocation. */
export const accessTokens = pgTable(
  "access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    /** Token-family id shared with the refresh-token lineage, for reuse-based
     *  family revocation. */
    familyId: uuid("family_id").notNull().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("access_tokens_user_id_idx").on(t.userId),
    index("access_tokens_client_id_idx").on(t.clientId),
    index("access_tokens_family_id_idx").on(t.familyId),
  ],
);

/** Refresh tokens to mint new access tokens without re-authorizing. */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    /** Lineage id: rotation carries it forward; presenting a revoked token from
     *  a family triggers revocation of the whole family (theft detection). */
    familyId: uuid("family_id").notNull().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("refresh_tokens_user_id_idx").on(t.userId),
    index("refresh_tokens_family_id_idx").on(t.familyId),
  ],
);

/**
 * Append-only credit ledger. Balance = SUM(delta) for a user.
 *  - delta > 0 : credits added (admin top-up has providerId = null)
 *  - delta < 0 : credits charged by a provider
 * `ref` is a per-provider idempotency key (unique, nullable for top-ups).
 */
export const ledger = pgTable(
  "ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    delta: integer("delta").notNull(),
    reason: text("reason"),
    ref: text("ref").unique(),
    ...timestamps,
  },
  (t) => [
    index("ledger_user_id_idx").on(t.userId),
    index("ledger_provider_id_idx").on(t.providerId),
  ],
);

/**
 * A payment a provider asks a user to confirm. The provider creates the intent
 * server-side (authenticated), so the amount can't be tampered with in the
 * browser; the user then confirms it. On confirmation we write a single ledger
 * charge keyed on the intent id (idempotent).
 */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    amount: integer("amount").notNull(),
    description: text("description"),
    /** Provider's own idempotency key for this charge. */
    ref: text("ref").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    /** Opaque value echoed back to the provider on return. */
    state: text("state"),
    /** pending | completed | cancelled */
    status: text("status").notNull().default("pending"),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Webhook delivery bookkeeping (null = no webhook configured for the
     *  client at the time the intent settled). pending | delivered | failed */
    webhookStatus: text("webhook_status"),
    webhookAttempts: integer("webhook_attempts").notNull().default(0),
    webhookLastError: text("webhook_last_error"),
    webhookDeliveredAt: timestamp("webhook_delivered_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (t) => [uniqueIndex("payment_intents_client_ref_idx").on(t.clientId, t.ref)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  ledger: many(ledger),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const ledgerRelations = relations(ledger, ({ one }) => ({
  user: one(users, { fields: [ledger.userId], references: [users.id] }),
  provider: one(clients, {
    fields: [ledger.providerId],
    references: [clients.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type LedgerEntry = typeof ledger.$inferSelect;
