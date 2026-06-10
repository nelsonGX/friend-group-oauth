import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { loginHandoffs, type LoginHandoff, type User } from "@/db/schema";
import { hashToken, randomToken } from "@/lib/crypto";

/**
 * Cross-device login hand-off (RFC 8628-style device flow applied to this
 * server's own login). The companion of {@link import("./devices")} — same
 * shape, but it mints a *session* rather than registering an app.
 *
 *  - The initiating browser calls {@link startLoginHandoff} and gets a secret
 *    `pollToken` (kept in memory, stored hashed) plus an unguessable `publicId`
 *    it renders as a QR.
 *  - A phone opens the QR's URL, logs in, and approves via
 *    {@link approveLoginHandoff}, binding its user to the row.
 *  - The browser polls {@link pollLoginHandoff}; the first poll after approval
 *    returns the approving user's id once and consumes the row, after which the
 *    caller mints that user's session.
 */

const HANDOFF_TTL_MS = 5 * 60 * 1000; // 5 minutes
const HANDOFF_POLL_INTERVAL_SECONDS = 3;

export type StartHandoffResult = {
  pollToken: string;
  publicId: string;
  expiresIn: number;
  interval: number;
};

/** Create a pending hand-off and return the secret poll token + public id. */
export async function startLoginHandoff(): Promise<StartHandoffResult> {
  const pollToken = randomToken(32);
  const publicId = randomToken(16);
  const db = getDb();
  await db.insert(loginHandoffs).values({
    pollTokenHash: hashToken(pollToken),
    publicId,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
  });

  return {
    pollToken,
    publicId,
    expiresIn: Math.floor(HANDOFF_TTL_MS / 1000),
    interval: HANDOFF_POLL_INTERVAL_SECONDS,
  };
}

export type HandoffPollResult =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "invalid" }
  | { status: "approved"; userId: string };

/**
 * Poll a hand-off by its secret `pollToken`. On the first poll after approval,
 * returns the approving user's id once and consumes the row; later polls report
 * `invalid`.
 */
export async function pollLoginHandoff(
  pollToken: string,
): Promise<HandoffPollResult> {
  if (!pollToken) return { status: "invalid" };
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(loginHandoffs)
      .where(eq(loginHandoffs.pollTokenHash, hashToken(pollToken)))
      .limit(1)
      .for("update");

    if (!row) return { status: "invalid" };
    if (row.status === "consumed") return { status: "invalid" };
    if (row.expiresAt.getTime() < Date.now()) return { status: "expired" };
    if (row.status === "denied") return { status: "denied" };

    // Enforce a minimum poll interval (slow-down without erroring the flow).
    const now = Date.now();
    const tooSoon =
      row.lastPolledAt != null &&
      now - row.lastPolledAt.getTime() < (HANDOFF_POLL_INTERVAL_SECONDS - 1) * 1000;
    if (tooSoon && row.status === "pending") return { status: "slow_down" };
    if (row.status === "pending") {
      await tx
        .update(loginHandoffs)
        .set({ lastPolledAt: new Date(now) })
        .where(eq(loginHandoffs.id, row.id));
      return { status: "pending" };
    }

    // status === "approved": hand over the user once, then consume.
    if (!row.userId) return { status: "invalid" };
    await tx
      .update(loginHandoffs)
      .set({ status: "consumed" })
      .where(
        and(
          eq(loginHandoffs.id, row.id),
          eq(loginHandoffs.status, "approved"),
        ),
      );

    return { status: "approved", userId: row.userId };
  });
}

/** Look up a still-pending, unexpired hand-off by its public id. */
export async function getHandoffByPublicId(
  publicId: string,
): Promise<LoginHandoff | null> {
  if (!publicId) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(loginHandoffs)
    .where(
      and(
        eq(loginHandoffs.publicId, publicId),
        eq(loginHandoffs.status, "pending"),
        gt(loginHandoffs.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type HandoffDecisionResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

/** Approve a pending hand-off, binding the approving user to it. */
export async function approveLoginHandoff(
  publicId: string,
  user: User,
): Promise<HandoffDecisionResult> {
  const db = getDb();
  const [row] = await db
    .update(loginHandoffs)
    .set({ status: "approved", userId: user.id })
    .where(
      and(
        eq(loginHandoffs.publicId, publicId),
        eq(loginHandoffs.status, "pending"),
        gt(loginHandoffs.expiresAt, new Date()),
      ),
    )
    .returning({ id: loginHandoffs.id });
  return row ? { ok: true } : { ok: false, reason: "not_found" };
}

/** Deny a pending hand-off. */
export async function denyLoginHandoff(
  publicId: string,
): Promise<HandoffDecisionResult> {
  const db = getDb();
  const [row] = await db
    .update(loginHandoffs)
    .set({ status: "denied" })
    .where(
      and(
        eq(loginHandoffs.publicId, publicId),
        eq(loginHandoffs.status, "pending"),
        gt(loginHandoffs.expiresAt, new Date()),
      ),
    )
    .returning({ id: loginHandoffs.id });
  return row ? { ok: true } : { ok: false, reason: "not_found" };
}
