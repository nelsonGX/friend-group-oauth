import { eq, getTableName, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  accessTokens,
  appData,
  appLedger,
  authorizationCodes,
  clients,
  cryptoDepositAddresses,
  cryptoDeposits,
  deviceAuthorizations,
  ledger,
  loginHandoffs,
  paymentIntents,
  redeemCodes,
  redemptions,
  refreshTokens,
  sessions,
  users,
  withdrawals,
} from "@/db/schema";

/**
 * Account migration: move a member from one Discord account to another.
 *
 * The surviving row is always the OLD user row, so its `users.id` — the OAuth
 * `sub` every provider app keys its users on, and the owner of the member's
 * deposit address, ledger, app data, apps, … — stays stable. Only its Discord
 * identity changes.
 *
 *  - New Discord account never logged in here: the old row simply takes the new
 *    Discord ID; the profile refreshes on the next login.
 *  - New Discord account already has a row: everything it owns is re-pointed
 *    onto the old row, the new row is deleted, and the old row adopts its
 *    Discord identity (ID, name, avatar, guild/role status).
 *
 * Sessions of the old Discord account are revoked, since that account no longer
 * maps to this member. Sessions of the new account carry over.
 */

/**
 * Every user-referencing column that a merge simply re-points from the new row
 * to the old one. Columns needing conflict handling (unique per user) are dealt
 * with separately. `scripts/verify-migrate.ts` checks this list (plus
 * {@link CONFLICT_COLUMNS}) against the live FK catalog, so a new table that
 * references users fails verification until it's handled here.
 */
const REPOINT_COLUMNS: AnyPgColumn[] = [
  ledger.userId,
  ledger.counterpartyUserId,
  appLedger.userId,
  paymentIntents.userId,
  withdrawals.userId,
  withdrawals.processedByUserId,
  cryptoDeposits.userId,
  cryptoDepositAddresses.userId,
  clients.ownerUserId,
  redeemCodes.createdByUserId,
  deviceAuthorizations.userId,
  loginHandoffs.userId,
  authorizationCodes.userId,
  accessTokens.userId,
  refreshTokens.userId,
  sessions.userId,
];

/** User columns under a per-user unique index, merged with conflict handling. */
const CONFLICT_COLUMNS: AnyPgColumn[] = [redemptions.userId, appData.userId];

/** `table.column` names of every user reference this module migrates. */
export const MIGRATED_USER_COLUMNS = [...REPOINT_COLUMNS, ...CONFLICT_COLUMNS].map(
  (c) => `${getTableName(c.table)}.${c.name}`,
);

export type MigrateAccountResult =
  | { ok: true; userId: string; merged: boolean }
  | { ok: false; reason: "invalid_input" | "same_account" | "source_not_found" };

export async function migrateAccount(opts: {
  fromDiscordId: string;
  toDiscordId: string;
}): Promise<MigrateAccountResult> {
  const fromDiscordId = opts.fromDiscordId.trim();
  const toDiscordId = opts.toDiscordId.trim();
  if (!fromDiscordId || !toDiscordId) return { ok: false, reason: "invalid_input" };
  if (fromDiscordId === toDiscordId) return { ok: false, reason: "same_account" };

  const db = getDb();
  return db.transaction(async (tx) => {
    // Lock both rows so concurrent charges/logins serialize behind the move.
    const [source] = await tx
      .select()
      .from(users)
      .where(eq(users.discordId, fromDiscordId))
      .for("update");
    if (!source) return { ok: false, reason: "source_not_found" };
    const [target] = await tx
      .select()
      .from(users)
      .where(eq(users.discordId, toDiscordId))
      .for("update");

    // The old Discord account must not stay signed in as this member.
    await tx.delete(sessions).where(eq(sessions.userId, source.id));

    if (!target) {
      await tx
        .update(users)
        .set({ discordId: toDiscordId })
        .where(eq(users.id, source.id));
      return { ok: true, userId: source.id, merged: false };
    }

    // Redemptions are once-per-user: where both accounts redeemed the same code,
    // drop the new account's row (its ledger credit still moves below).
    await tx.execute(sql`
      delete from ${redemptions} t
      using ${redemptions} s
      where t.user_id = ${target.id}
        and s.user_id = ${source.id}
        and t.code_id = s.code_id`);

    // Per-user app data is unique per (app, key): keep the more recently
    // updated value of the two (the old account's on a tie).
    await tx.execute(sql`
      delete from ${appData} a
      using ${appData} b
      where a.user_id in (${source.id}, ${target.id})
        and b.user_id in (${source.id}, ${target.id})
        and a.user_id <> b.user_id
        and a.client_id = b.client_id
        and a.key = b.key
        and (a.updated_at < b.updated_at
          or (a.updated_at = b.updated_at and a.user_id = ${target.id}))`);

    for (const column of [...REPOINT_COLUMNS, ...CONFLICT_COLUMNS]) {
      await tx.execute(
        sql`update ${column.table} set ${sql.identifier(column.name)} = ${source.id} where ${column} = ${target.id}`,
      );
    }

    // Free the new Discord ID (unique) before the old row takes it over.
    await tx.delete(users).where(eq(users.id, target.id));
    await tx
      .update(users)
      .set({
        discordId: target.discordId,
        username: target.username,
        globalName: target.globalName,
        avatar: target.avatar,
        inGuild: target.inGuild,
        allowed: target.allowed,
        lastRoleCheck: target.lastRoleCheck,
        lastLogin: target.lastLogin,
        isAdmin: source.isAdmin || target.isAdmin,
      })
      .where(eq(users.id, source.id));
    return { ok: true, userId: source.id, merged: true };
  });
}
