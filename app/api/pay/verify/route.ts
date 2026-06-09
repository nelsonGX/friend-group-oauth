import { authenticateClient, getClientCredentials } from "@/lib/oauth";
import { getIntent } from "@/lib/payments";

/**
 * Authoritative status check for a payment intent. The provider calls this
 * (server-to-server, authenticated) after the user returns, to confirm the
 * charge really happened before granting value.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const creds = getClientCredentials(request, form);
  const client = await authenticateClient(creds.clientId, creds.clientSecret);
  if (!client) return Response.json({ error: "invalid_client" }, { status: 401 });

  const intentId = form.get("intent_id")?.toString();
  if (!intentId) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const intent = await getIntent(intentId);
  if (!intent || intent.clientId !== client.clientId) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return Response.json(
    {
      intent_id: intent.id,
      status: intent.status,
      amount: intent.amount,
      ref: intent.ref,
      description: intent.description,
      user_id: intent.userId,
      paid: intent.status === "completed",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
