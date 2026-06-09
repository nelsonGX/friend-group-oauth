"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { topUp } from "@/lib/credits";
import { hashSecret, randomToken } from "@/lib/crypto";
import { SUPPORTED_SCOPES } from "@/lib/oauth";

async function assertAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user?.isAdmin;
}

export interface ActionState {
  ok: boolean;
  message: string;
  clientId?: string;
  secret?: string;
}

/** Grant credits to a user identified by Discord ID (manual top-up). */
export async function grantCredits(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await assertAdmin())) return { ok: false, message: "Not authorized." };

  const discordId = formData.get("discordId")?.toString().trim();
  const amount = Number(formData.get("amount"));
  const reason = formData.get("reason")?.toString().trim() || "Admin top-up";

  if (!discordId || !Number.isInteger(amount) || amount <= 0) {
    return {
      ok: false,
      message: "Provide a Discord ID and a positive integer amount.",
    };
  }

  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.discordId, discordId))
    .limit(1);
  if (!target) {
    return {
      ok: false,
      message: "No user with that Discord ID (they must log in here once first).",
    };
  }

  const balance = await topUp({ userId: target.id, amount, reason });
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Granted ${amount} credits to ${target.username}. New balance: ${balance}.`,
  };
}

/** Register a new provider/client. Returns the secret once (never stored raw). */
export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await assertAdmin())) return { ok: false, message: "Not authorized." };

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
    return { ok: false, message: "Name and at least one redirect URI are required." };
  }
  for (const uri of redirectUris) {
    try {
      new URL(uri);
    } catch {
      return { ok: false, message: `Invalid redirect URI: ${uri}` };
    }
  }
  const invalid = scopes.filter(
    (s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  if (invalid.length) {
    return { ok: false, message: `Unknown scope(s): ${invalid.join(", ")}` };
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
    message: "Client created. Copy the secret now — it will not be shown again.",
    clientId,
    secret,
  };
}

/** Toggle a client's active state. */
export async function toggleClientActive(formData: FormData) {
  if (!(await assertAdmin())) return;
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
  if (!(await assertAdmin())) return;
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return;
  await getDb()
    .update(clients)
    .set({ trusted: sql`not ${clients.trusted}` })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/admin");
}
