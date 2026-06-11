import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { pollAllChains } from "@/lib/topups";

/**
 * Background settlement endpoint. Point an external scheduler at
 * `GET /api/topups/poll?secret=<TOPUP_POLL_SECRET>` every minute or two: it reads
 * recent USDT transfers to every member's deposit address on every supported
 * chain and credits new ones. Idempotent, so overlapping runs are safe.
 *
 * Guarded by a shared secret (constant-time compared). Accepts the secret either
 * as `?secret=` or an `authorization: Bearer <secret>` header.
 */
function authorized(req: Request): boolean {
  if (!env.TOPUPS_ENABLED) return false;
  const expected = env.TOPUP_POLL_SECRET;
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const summaries = await pollAllChains();
  const settled = summaries.reduce((n, s) => n + s.settled, 0);
  return Response.json(
    { ok: true, settled, chains: summaries },
    { headers: { "cache-control": "no-store" } },
  );
}
