import { authenticateClient, getClientCredentials } from "@/lib/oauth";
import { reversePayout } from "@/lib/app-balance";

/**
 * Provider-authenticated reverse payment. The app pays credits from its app
 * balance to a user, idempotent on (client, ref).
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
  if (!client) {
    return Response.json(
      { error: "invalid_client" },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "www-authenticate": "Basic",
        },
      },
    );
  }

  const amount = Number(form.get("amount"));
  const userId = form.get("user_id")?.toString();
  const ref = form.get("ref")?.toString();
  const description = form.get("description")?.toString();

  if (!userId || !ref || !Number.isInteger(amount) || amount <= 0) {
    return json(
      {
        error: "invalid_request",
        error_description:
          "amount (positive integer), user_id, and ref are required.",
      },
      400,
    );
  }

  const result = await reversePayout({
    clientId: client.id,
    userId,
    amount,
    ref,
    reason: description || undefined,
  });

  if (!result.ok) {
    if (result.reason === "recipient_not_found") {
      return json(
        {
          error: "invalid_request",
          error_description: "user_id does not identify a known user.",
        },
        400,
      );
    }
    if (result.reason === "insufficient_funds") {
      return json(
        {
          error: "insufficient_funds",
          error_description: "The app balance is too low for this payout.",
          balance: result.balance,
        },
        402,
      );
    }
    return json(
      {
        error: "invalid_request",
        error_description: "amount must be a positive integer.",
      },
      400,
    );
  }

  return json(
    {
      payout_id: result.payoutId,
      status: "completed",
      amount,
      user_id: userId,
      ref,
      description: description || null,
      duplicate: result.duplicate,
      app_balance: result.balance,
      paid: true,
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
