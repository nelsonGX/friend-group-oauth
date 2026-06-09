import { pollLoginHandoff } from "@/lib/handoff";
import { createSession } from "@/lib/session";

/**
 * Poll a cross-device login hand-off. The initiating browser sends the
 * `poll_token` it received from /start; while the phone hasn't approved we
 * report `pending`/`slow_down`. On the first poll after approval we mint the
 * approving user's session (sets the `fg_session` cookie on this response) and
 * report `approved` exactly once, then the row is consumed.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ status: "invalid" }, 400);
  }

  const pollToken =
    typeof (body as Record<string, unknown>)?.poll_token === "string"
      ? ((body as Record<string, unknown>).poll_token as string)
      : "";

  const result = await pollLoginHandoff(pollToken);

  switch (result.status) {
    case "pending":
      return json({ status: "pending" }, 200);
    case "slow_down":
      return json({ status: "slow_down" }, 200);
    case "denied":
      return json({ status: "denied" }, 200);
    case "expired":
      return json({ status: "expired" }, 200);
    case "invalid":
      return json({ status: "invalid" }, 200);
    case "approved":
      await createSession(result.userId);
      return json({ status: "approved" }, 200);
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
