"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, users } from "@/db/schema";
import { auth } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import { adjustBalance, getActivity, getBalance } from "@/lib/credits";
import { activityLabel } from "@/lib/activity";
import {
  markWithdrawalPaid as markWithdrawalPaidLib,
  rejectWithdrawal as rejectWithdrawalLib,
} from "@/lib/withdrawals";
import { createRedeemCode as mintRedeemCode } from "@/lib/redeem";
import { redeemCodes } from "@/db/schema";
import { hashSecret, randomToken } from "@/lib/crypto";
import { SUPPORTED_SCOPES } from "@/lib/oauth";

export interface ActionState {
  ok: boolean;
  message: string;
  clientId?: string;
  secret?: string;
  code?: string;
}

/** Adjust credits for a user identified by Discord ID (manual admin correction). */
export async function grantCredits(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { t } = await getDictionary();
  const d = t.adminActions;
  const user = await auth();
  if (!user?.isAdmin) return { ok: false, message: d.notAuthorized };

  const discordId = formData.get("discordId")?.toString().trim();
  const amount = Number(formData.get("amount"));
  const reason = formData.get("reason")?.toString().trim() || "Admin adjustment";

  if (!discordId || !Number.isInteger(amount) || amount === 0) {
    return { ok: false, message: d.provideIdAndAmount };
  }

  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.discordId, discordId))
    .limit(1);
  if (!target) {
    return { ok: false, message: d.noUserWithId };
  }

  const result = await adjustBalance({ userId: target.id, delta: amount, reason });
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "insufficient_funds"
          ? format(d.adjustmentInsufficient, { balance: result.balance })
          : d.provideIdAndAmount,
    };
  }
  revalidatePath("/admin");
  return {
    ok: true,
    message: format(d.adjusted, {
      amount,
      user: target.username,
      balance: result.balance,
    }),
  };
}

export interface UserHistoryEntry {
  id: string;
  time: string;
  label: string;
  delta: number;
}

export type UserHistoryResult =
  | { ok: true; name: string; balance: number; entries: UserHistoryEntry[] }
  | { ok: false; message: string };

/**
 * The full ledger for a member, resolved into display rows. Admin-only and read
 * on demand (when the row's history popup opens) so the admin table itself stays
 * cheap — we don't pre-load every user's transactions up front.
 */
export async function fetchUserHistory(
  discordId: string,
): Promise<UserHistoryResult> {
  const { t } = await getDictionary();
  const d = t.adminActions;
  const user = await auth();
  if (!user?.isAdmin) return { ok: false, message: d.notAuthorized };

  const id = discordId.trim();
  if (!id) return { ok: false, message: d.provideIdAndAmount };

  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.discordId, id))
    .limit(1);
  if (!target) return { ok: false, message: d.noUserWithId };

  // A generous cap rather than paging: enough to be the member's whole history
  // in practice for a friend-group ledger, without an unbounded scan.
  const [balance, entries] = await Promise.all([
    getBalance(target.id),
    getActivity(target.id, 1000),
  ]);

  return {
    ok: true,
    name: target.globalName ?? target.username,
    balance,
    entries: entries.map((entry) => ({
      id: entry.id,
      time: entry.createdAt.toISOString().slice(0, 16).replace("T", " "),
      label: activityLabel(entry, t.dashboard),
      delta: entry.delta,
    })),
  };
}

/** Register a new provider/client. Returns the secret once (never stored raw). */
export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { t } = await getDictionary();
  const d = t.adminActions;
  const user = await auth();
  if (!user?.isAdmin) return { ok: false, message: d.notAuthorized };

  const name = formData.get("name")?.toString().trim();
  const redirectUris = (formData.get("redirectUris")?.toString() ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  const scopes = (formData.get("scopes")?.toString() ?? "identify")
    .split(/[\s,]+/)
    .filter(Boolean);
  const trusted = formData.get("trusted") === "on";
  const ownerDiscordId = formData.get("ownerDiscordId")?.toString().trim();

  if (!name || redirectUris.length === 0) {
    return { ok: false, message: d.nameAndRedirectRequired };
  }
  for (const uri of redirectUris) {
    try {
      new URL(uri);
    } catch {
      return { ok: false, message: format(d.invalidRedirectUri, { uri }) };
    }
  }
  const invalid = scopes.filter(
    (s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  if (invalid.length) {
    return { ok: false, message: format(d.unknownScopes, { scopes: invalid.join(", ") }) };
  }

  const db = getDb();
  let ownerUserId: string | null = null;
  if (ownerDiscordId) {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.discordId, ownerDiscordId))
      .limit(1);
    ownerUserId = owner?.id ?? null;
  }

  const clientId = `fgc_${randomToken(8)}`;
  const secret = randomToken(32);
  await db.insert(clients).values({
    name,
    clientId,
    clientSecretHash: hashSecret(secret),
    redirectUris,
    allowedScopes: scopes.length ? scopes : ["identify"],
    trusted,
    ownerUserId,
  });

  revalidatePath("/admin");
  return {
    ok: true,
    message: d.clientCreated,
    clientId,
    secret,
  };
}

/** Toggle a client's active state. */
export async function toggleClientActive(formData: FormData) {
  const user = await auth();
  if (!user?.isAdmin) return;
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return;
  await getDb()
    .update(clients)
    .set({ isActive: sql`not ${clients.isActive}` })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/admin");
}

/** Toggle a client's trusted (consent-skip) state. */
export async function toggleClientTrusted(formData: FormData) {
  const user = await auth();
  if (!user?.isAdmin) return;
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return;
  await getDb()
    .update(clients)
    .set({ trusted: sql`not ${clients.trusted}` })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/admin");
}

/** Set a client's /explore directory category ('tools' or 'fun'). */
export async function setClientCategory(formData: FormData) {
  const user = await auth();
  if (!user?.isAdmin) return;
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return;
  const category = formData.get("category")?.toString() === "fun" ? "fun" : "tools";
  await getDb()
    .update(clients)
    .set({ category })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/admin");
  revalidatePath("/explore");
}

/** Mint a redeem code worth `amount` credits. Returns the code once for sharing. */
export async function createRedeemCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { t } = await getDictionary();
  const d = t.adminActions;
  const user = await auth();
  if (!user?.isAdmin) return { ok: false, message: d.notAuthorized };

  const amount = Number(formData.get("amount"));
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: d.invalidRedeemAmount };
  }

  // Blank max-uses → unlimited; blank expiry → never. Both are positive ints if set.
  const maxRaw = formData.get("maxRedemptions")?.toString().trim();
  let maxRedemptions: number | null = null;
  if (maxRaw) {
    const n = Number(maxRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, message: d.invalidMaxRedemptions };
    }
    maxRedemptions = n;
  }

  const daysRaw = formData.get("expiresInDays")?.toString().trim();
  let expiresAt: Date | null = null;
  if (daysRaw) {
    const days = Number(daysRaw);
    if (!Number.isInteger(days) || days <= 0) {
      return { ok: false, message: d.invalidExpiresInDays };
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const custom = formData.get("code")?.toString().trim() || undefined;

  let created;
  try {
    created = await mintRedeemCode({
      amount,
      maxRedemptions,
      expiresAt,
      createdByUserId: user.id,
      code: custom,
    });
  } catch {
    // Almost always a unique collision on a caller-supplied custom code.
    return { ok: false, message: d.redeemCodeExists };
  }

  revalidatePath("/admin");
  return { ok: true, message: d.redeemCodeCreated, code: created.code };
}

/** Toggle a redeem code's active state. */
export async function toggleRedeemCodeActive(formData: FormData) {
  const user = await auth();
  if (!user?.isAdmin) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  await getDb()
    .update(redeemCodes)
    .set({ active: sql`not ${redeemCodes.active}` })
    .where(eq(redeemCodes.id, id));
  revalidatePath("/admin");
}

/** Mark a pending withdrawal as paid (admin has sent the money off-platform). */
export async function markWithdrawalPaid(formData: FormData) {
  const user = await auth();
  if (!user?.isAdmin) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  const adminNote = formData.get("adminNote")?.toString() ?? null;
  await markWithdrawalPaidLib({ id, adminId: user.id, adminNote });
  revalidatePath("/admin");
}

/** Reject a pending withdrawal, returning the escrowed credits to the developer. */
export async function rejectWithdrawal(formData: FormData) {
  const user = await auth();
  if (!user?.isAdmin) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  const adminNote = formData.get("adminNote")?.toString() ?? null;
  await rejectWithdrawalLib({ id, adminId: user.id, adminNote });
  revalidatePath("/admin");
}
