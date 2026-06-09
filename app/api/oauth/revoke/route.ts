import {
  authenticateClient,
  getClientCredentials,
  revokeToken,
} from "@/lib/oauth";

/** OAuth2 token revocation endpoint (RFC 7009). Always returns 200. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(null, { status: 200 });
  }

  const creds = getClientCredentials(request, form);
  const client = await authenticateClient(creds.clientId, creds.clientSecret);
  if (!client) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }

  const token = form.get("token")?.toString();
  if (token) {
    await revokeToken(client.clientId, token);
  }
  return new Response(null, { status: 200 });
}
