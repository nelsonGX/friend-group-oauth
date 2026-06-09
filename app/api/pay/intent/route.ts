import { authenticateClient, getClientCredentials } from "@/lib/oauth";
import { createIntent } from "@/lib/payments";
import { env } from "@/lib/env";

/**
 * Provider-authenticated payment intent creation. The provider POSTs (form-
 * encoded) amount + ref + redirect_uri with its client credentials; we return a
 * URL to send the user to for confirmation. Idempotent on (client, ref).
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const creds = getClientCredentials(request, form);
  const client = await authenticateClient(creds.clientId, creds.clientSecret);
  if (!client) return json({ error: "invalid_client" }, 401);

  const amount = Number(form.get("amount"));
  const ref = form.get("ref")?.toString();
  const redirectUri = form.get("redirect_uri")?.toString();
  const description = form.get("description")?.toString();
  const state = form.get("state")?.toString();

  if (!ref || !redirectUri || !Number.isInteger(amount) || amount <= 0) {
    return json(
      {
        error: "invalid_request",
        error_description:
          "amount (positive integer), ref, and redirect_uri are required.",
      },
      400,
    );
  }

  const intent = await createIntent({
    client,
    amount,
    description,
    ref,
    redirectUri,
    state,
  });
  if (!intent) {
    return json(
      {
        error: "invalid_request",
        error_description: "redirect_uri is not registered for this client.",
      },
      400,
    );
  }

  return json(
    {
      intent_id: intent.id,
      url: `${env.APP_URL}/pay?intent=${intent.id}`,
      amount: intent.amount,
      status: intent.status,
      expires_at: intent.expiresAt,
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
