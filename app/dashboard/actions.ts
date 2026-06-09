"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accessTokens, clients, refreshTokens } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { hashSecret, randomToken } from "@/lib/crypto";

/** Revoke all of the current user's tokens for one connected app. */
export async function revokeAppAccess(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return;

  const db = getDb();
  await db
    .update(accessTokens)
    .set({ revoked: true })
    .where(and(eq(accessTokens.userId, user.id), eq(accessTokens.clientId, clientId)));
  await db
    .update(refreshTokens)
    .set({ revoked: true })
    .where(and(eq(refreshTokens.userId, user.id), eq(refreshTokens.clientId, clientId)));
  revalidatePath("/dashboard");
}

export interface SecretState {
  ok: boolean;
  message: string;
  secret?: string;
}

/** Regenerate the client secret for a provider the user owns (or admin). */
export async function regenerateSecret(
  _prev: SecretState,
  formData: FormData,
): Promise<SecretState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Not authorized." };
  const clientId = formData.get("clientId")?.toString();
  if (!clientId) return { ok: false, message: "Missing client." };

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.clientId, clientId))
    .limit(1);
  if (!client || (client.ownerUserId !== user.id && !user.isAdmin)) {
    return { ok: false, message: "Not your client." };
  }

  const secret = randomToken(32);
  await db
    .update(clients)
    .set({ clientSecretHash: hashSecret(secret) })
    .where(eq(clients.clientId, clientId));
  revalidatePath("/dashboard");
  return { ok: true, message: "New secret generated — copy it now.", secret };
}
