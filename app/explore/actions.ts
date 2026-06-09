"use server";

import { revalidatePath } from "next/cache";
import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { format } from "@/lib/i18n/format";
import { transfer } from "@/lib/credits";

export interface TransferState {
  ok: boolean;
  message: string;
}

/**
 * Send credits to another member. The recipient is resolved by exact Discord ID
 * or username; the actual balance check + double-entry write happens atomically
 * in {@link transfer}. Guards mirror the pay flow: signed in and `allowed`.
 */
export async function transferCredits(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  const { t } = await getDictionary();
  const w = t.explore.wallet;
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: w.notAllowed };
  if (!user.allowed && !user.isAdmin) {
    return { ok: false, message: w.notAllowed };
  }

  const recipient = formData.get("recipient")?.toString().trim();
  const amount = Number(formData.get("amount"));
  const note = formData.get("note")?.toString().trim() || undefined;

  if (!recipient) return { ok: false, message: w.recipientRequired };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: w.invalidAmount };
  }

  const db = getDb();
  const [target] = await db
    .select({ id: users.id, username: users.username, globalName: users.globalName })
    .from(users)
    .where(or(eq(users.discordId, recipient), eq(users.username, recipient)))
    .limit(1);
  if (!target) return { ok: false, message: w.recipientNotFound };

  const result = await transfer({
    fromUserId: user.id,
    toUserId: target.id,
    amount,
    reason: note,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "self_transfer":
        return { ok: false, message: w.selfTransfer };
      case "recipient_not_found":
        return { ok: false, message: w.recipientNotFound };
      case "invalid_amount":
        return { ok: false, message: w.invalidAmount };
      case "insufficient_funds":
        return {
          ok: false,
          message: format(w.insufficient, { needed: amount - result.balance }),
        };
    }
  }

  revalidatePath("/explore");
  return {
    ok: true,
    message: format(w.sent, {
      amount,
      name: target.globalName ?? target.username,
    }),
  };
}
