import { relations, sql } from "drizzle-orm";
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
  /** Public-facing display title for the /explore directory; falls back to `name`. */
  displayTitle: text("display_title"),
  /** Short blurb shown on the directory card. */
  description: text("description"),
  /** Link to an icon image shown on the directory card. */
  iconUrl: text("icon_url"),
  /** Homepage the directory's "Visit" button links to. */
  websiteUrl: text("website_url"),
  /** Whether the owner has opted this app into the public /explore directory. */
  listed: boolean("listed").notNull().default(false),
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
 * Append-only, double-entry credit ledger. Balance = SUM(delta) for a user.
 *  - delta > 0 : credits received (admin top-up, a transfer in, or app income)
 *  - delta < 0 : credits spent (a charge/payment, or a transfer out)
 * Money movements are two-sided: a payment to an app writes a debit on the payer
 * AND a matching `income` credit on the app's owner; a peer transfer writes a
 * `transfer_out` debit and a `transfer_in` credit. `counterpartyUserId` records
 * the other side, and `kind` lets the UI label each row.
 * `ref` is a unique idempotency key (nullable for admin top-ups).
 * `kind`: topup | charge | income | transfer_in | transfer_out | redeem |
 *         withdrawal | withdrawal_refund | adjustment
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
    /** The other party in a transfer/payment (payer, recipient, or sender). */
    counterpartyUserId: uuid("counterparty_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    delta: integer("delta").notNull(),
    /** topup | charge | income | transfer_in | transfer_out | adjustment */
    kind: text("kind").notNull().default("adjustment"),
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

/**
 * A pending "register an app on my behalf" request from a coding-agent skill,
 * approved in the browser (RFC 8628-style device flow). The skill polls with the
 * secret `device_code` (stored hashed); the user approves via the short
 * `user_code`. On approval we create the client and stash its `client_id` plus
 * the **plaintext** `client_secret` here transiently, so the next poll can return
 * the credentials exactly once — then we null the secret and mark it consumed.
 * Rows are short-lived (~15 min) and the hashed device_code is the only bearer.
 */
export const deviceAuthorizations = pgTable(
  "device_authorizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Hash of the device_code the skill holds; never stored in plaintext. */
    deviceCodeHash: text("device_code_hash").notNull().unique(),
    /** Short, human-typable code the user enters/confirms in the browser. */
    userCode: text("user_code").notNull().unique(),
    /** pending | approved | denied | consumed */
    status: text("status").notNull().default("pending"),
    /** Proposed registration, shown on the approval screen for review. */
    requestedName: text("requested_name").notNull(),
    requestedRedirectUris: jsonb("requested_redirect_uris")
      .$type<string[]>()
      .notNull()
      .default([]),
    requestedScopes: jsonb("requested_scopes")
      .$type<string[]>()
      .notNull()
      .default(["identify"]),
    /** The approving user (set on approval). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** The created client's public id (set on approval). */
    clientId: text("client_id"),
    /** Plaintext secret, transient: set on approval, cleared once retrieved. */
    clientSecret: text("client_secret"),
    /** Last poll time, for slow-down enforcement. */
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("device_authorizations_user_code_idx").on(t.userCode)],
);

/**
 * A pending "sign this browser in for me" request, approved on a second device
 * (the same RFC 8628-style device flow as {@link deviceAuthorizations}, but for
 * this server's *own* login rather than app registration). The initiating
 * browser holds a secret `poll_token` (stored hashed) and shows a QR encoding
 * the public, unguessable `publicId`. A phone opens that URL, logs in, and
 * approves; the next poll from the initiating browser mints its session and
 * consumes the row. Short-lived (~5 min); the hashed poll token is the only
 * bearer that can claim the resulting session.
 */
export const loginHandoffs = pgTable(
  "login_handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Hash of the secret the initiating browser polls with; never plaintext. */
    pollTokenHash: text("poll_token_hash").notNull().unique(),
    /** Unguessable id embedded in the QR; the approving phone looks the row up by it. */
    publicId: text("public_id").notNull().unique(),
    /** pending | approved | denied | consumed */
    status: text("status").notNull().default("pending"),
    /** The approving user (set on approval); whose session the browser receives. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Last poll time, for slow-down enforcement. */
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("login_handoffs_public_id_idx").on(t.publicId)],
);

/**
 * Admin-created codes a member can redeem for credits (coupons / gift codes).
 * Stored in plaintext — a low-sensitivity, admin-distributed value (like
 * `clients.webhookSecret`) — so admins can list and re-share active codes. Each
 * successful redemption writes a `redeem` ledger row keyed on the redemption id.
 * Usage is bounded by `maxRedemptions` (null = unlimited) and limited to once per
 * user by the unique index on the `redemptions` table.
 */
export const redeemCodes = pgTable("redeem_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  /** Credits granted per redemption. */
  amount: integer("amount").notNull(),
  /** Max redemptions across all users; null = unlimited. */
  maxRedemptions: integer("max_redemptions"),
  /** Optional expiry; null = never expires. */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  ...timestamps,
});

/** One member's redemption of a code. Unique (codeId, userId) enforces once-per-user. */
export const redemptions = pgTable(
  "redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeId: uuid("code_id")
      .notNull()
      .references(() => redeemCodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("redemptions_code_user_idx").on(t.codeId, t.userId),
    index("redemptions_code_id_idx").on(t.codeId),
  ],
);

/**
 * A developer's request to cash out earned credits for real money. Only credits
 * a user *earned* (income from their apps) are withdrawable — transferred-in,
 * granted, or redeemed credits are not (see {@link getWithdrawableEarnings}).
 *
 * Requesting one immediately escrows the amount: a matching `withdrawal` debit is
 * written to the ledger so the credits leave the spendable balance and can't be
 * double-withdrawn or spent. An admin pays out off-platform and marks it `paid`;
 * rejecting (admin) or cancelling (the developer) writes a `withdrawal_refund`
 * credit that returns the escrowed amount. `payoutDetails` is the free-text
 * account/crypto address the admin pays to.
 */
export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    /** Where/how to pay the developer — bank account, PayPal, crypto address, … */
    payoutDetails: text("payout_details").notNull(),
    /** Optional message from the developer to the admin. */
    note: text("note"),
    /** pending | paid | rejected | cancelled */
    status: text("status").notNull().default("pending"),
    /** Admin's note when processing (payment reference, rejection reason). */
    adminNote: text("admin_note"),
    /** The admin who paid or rejected it. */
    processedByUserId: uuid("processed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("withdrawals_user_id_idx").on(t.userId),
    index("withdrawals_status_idx").on(t.status),
  ],
);

/**
 * Hosted JSON key–value store for provider apps ("database as a service").
 *
 * Each row is one JSON value addressed by `key` within a namespace owned by a
 * client (the app). Two scopes share the table:
 *  - app-global : `userId IS NULL` — data shared across the whole app.
 *  - per-user   : `userId` set — data keyed to one of the app's users (the OAuth
 *                 `sub`). Apps store/fetch it server-to-server with their client
 *                 credentials.
 *
 * Uniqueness is enforced per scope by two PARTIAL unique indexes rather than one
 * composite unique, because a nullable `userId` can't anchor a single key: in
 * Postgres NULLs are distinct, so `(client_id, NULL, key)` would never collide
 * and app-global keys could duplicate. Splitting on `userId IS [NOT] NULL` gives
 * exactly one slot per (app, key) and per (app, user, key).
 */
export const appData = pgTable(
  "app_data",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Owning user for per-user data; NULL marks an app-global value. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    /** Arbitrary JSON; may legitimately be the JSON value `null`. */
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("app_data_app_key_idx")
      .on(t.clientId, t.key)
      .where(sql`${t.userId} is null`),
    uniqueIndex("app_data_user_key_idx")
      .on(t.clientId, t.userId, t.key)
      .where(sql`${t.userId} is not null`),
    index("app_data_scope_idx").on(t.clientId, t.userId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  ledger: many(ledger),
  withdrawals: many(withdrawals),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const ledgerRelations = relations(ledger, ({ one }) => ({
  user: one(users, { fields: [ledger.userId], references: [users.id] }),
  counterparty: one(users, {
    fields: [ledger.counterpartyUserId],
    references: [users.id],
  }),
  provider: one(clients, {
    fields: [ledger.providerId],
    references: [clients.id],
  }),
}));

export const redeemCodesRelations = relations(redeemCodes, ({ many }) => ({
  redemptions: many(redemptions),
}));

export const redemptionsRelations = relations(redemptions, ({ one }) => ({
  code: one(redeemCodes, {
    fields: [redemptions.codeId],
    references: [redeemCodes.id],
  }),
  user: one(users, { fields: [redemptions.userId], references: [users.id] }),
}));

export const withdrawalsRelations = relations(withdrawals, ({ one }) => ({
  user: one(users, { fields: [withdrawals.userId], references: [users.id] }),
  processedBy: one(users, {
    fields: [withdrawals.processedByUserId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type LedgerEntry = typeof ledger.$inferSelect;
export type DeviceAuthorization = typeof deviceAuthorizations.$inferSelect;
export type LoginHandoff = typeof loginHandoffs.$inferSelect;
export type RedeemCode = typeof redeemCodes.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type AppDatum = typeof appData.$inferSelect;
