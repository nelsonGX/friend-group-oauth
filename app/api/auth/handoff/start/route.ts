import { startLoginHandoff } from "@/lib/handoff";
import { qrDataUrl } from "@/lib/qr";
import { env } from "@/lib/env";

/**
 * Begin a cross-device login hand-off. Called (unauthenticated — this runs
 * before login) by the initiating browser when it shows the "continue on phone"
 * option. Returns the secret `poll_token` the browser keeps in memory plus a
 * ready-to-render QR encoding the public approval URL. The public id itself is
 * never returned — the browser only needs the QR; only a phone that scans it
 * learns the id.
 */
export async function POST() {
  const handoff = await startLoginHandoff();
  const qr = await qrDataUrl(`${env.APP_URL}/handoff/${handoff.publicId}`);

  return json(
    {
      poll_token: handoff.pollToken,
      qr,
      expires_in: handoff.expiresIn,
      interval: handoff.interval,
    },
    200,
  );
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
