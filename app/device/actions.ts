"use server";

import { auth } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { approveDevice, denyDevice } from "@/lib/devices";

export interface DeviceDecisionState {
  status: "idle" | "approved" | "denied" | "not_found" | "error";
  message: string;
}

/**
 * Approve or deny a device authorization. Re-checks the session + access
 * server-side (never trusts the rendered request). On approval the client is
 * created and its credentials are handed to the polling skill on its next poll.
 */
export async function decideDevice(
  _prev: DeviceDecisionState,
  formData: FormData,
): Promise<DeviceDecisionState> {
  const { t } = await getDictionary();
  const d = t.device;
  const user = await auth();
  if (!user) return { status: "error", message: d.notSignedIn };
  if (!user.allowed && !user.isAdmin) {
    return { status: "error", message: d.needAccess };
  }

  const userCode = formData.get("user_code")?.toString() ?? "";
  const approve = formData.get("decision")?.toString() === "approve";

  if (!approve) {
    const result = await denyDevice(userCode);
    if (!result.ok) return { status: "not_found", message: d.notFound };
    return { status: "denied", message: d.deniedMessage };
  }

  const result = await approveDevice(userCode, user);
  if (!result.ok) return { status: "not_found", message: d.notFound };
  return { status: "approved", message: d.approvedMessage };
}
