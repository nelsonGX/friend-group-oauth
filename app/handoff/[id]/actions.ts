"use server";

import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { approveLoginHandoff, denyLoginHandoff } from "@/lib/handoff";

export interface HandoffDecisionState {
  status: "idle" | "approved" | "denied" | "not_found" | "error";
  message: string;
}

/**
 * Approve or deny a cross-device login hand-off. Re-checks the session
 * server-side (never trusts the rendered request) and binds *this* logged-in
 * phone user to the hand-off; the waiting browser then receives this user's
 * session on its next poll.
 */
export async function decideHandoff(
  _prev: HandoffDecisionState,
  formData: FormData,
): Promise<HandoffDecisionState> {
  const { t } = await getDictionary();
  const h = t.handoff;
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: h.needLogin };

  const publicId = formData.get("public_id")?.toString() ?? "";
  const approve = formData.get("decision")?.toString() === "approve";

  if (!approve) {
    const result = await denyLoginHandoff(publicId);
    if (!result.ok) return { status: "not_found", message: h.expiredBody };
    return { status: "denied", message: h.deniedBody };
  }

  const result = await approveLoginHandoff(publicId, user);
  if (!result.ok) return { status: "not_found", message: h.expiredBody };
  return { status: "approved", message: h.approvedBody };
}
