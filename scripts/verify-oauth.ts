import { createHash, randomBytes } from "node:crypto";
import { check, createTestDb, schema, summarize } from "./harness";
import { hashSecret, verifyPkceS256 } from "../lib/crypto";
import {
  authenticateClient,
  issueAuthorizationCode,
  redeemAuthorizationCode,
  resolveAccessToken,
  revokeToken,
  rotateRefreshToken,
} from "../lib/oauth";

/** End-to-end verification of the OAuth2 + PKCE provider against PGlite. */
async function main() {
  const db = await createTestDb();

  const [user] = await db
    .insert(schema.users)
    .values({ discordId: "111", username: "tester", allowed: true, inGuild: true })
    .returning();

  const secret = "super-secret";
  const redirectUri = "https://app.example.com/callback";
  const [client] = await db
    .insert(schema.clients)
    .values({
      name: "Test App",
      clientId: "client_abc",
      clientSecretHash: hashSecret(secret),
      redirectUris: [redirectUri],
      allowedScopes: ["identify", "roles", "credits"],
    })
    .returning();

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  check("verifyPkceS256 sanity", verifyPkceS256(verifier, challenge));
  check("authenticateClient accepts correct secret", !!(await authenticateClient("client_abc", secret)));
  check("authenticateClient rejects wrong secret", !(await authenticateClient("client_abc", "nope")));

  const code = await issueAuthorizationCode({
    clientId: client.clientId,
    userId: user.id,
    redirectUri,
    scope: "identify roles credits",
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });

  const redeemed = await redeemAuthorizationCode({ client, code, redirectUri, codeVerifier: verifier });
  check("authorization_code redeems with valid PKCE", redeemed.ok);

  if (redeemed.ok) {
    const resolved = await resolveAccessToken(redeemed.tokens.access_token);
    check("access token resolves to the user", resolved?.user.id === user.id);
    check("resolved scopes include credits", !!resolved?.scopes.includes("credits"));

    const replay = await redeemAuthorizationCode({ client, code, redirectUri, codeVerifier: verifier });
    check("used authorization code cannot be replayed", !replay.ok);

    await revokeToken(client.clientId, redeemed.tokens.access_token);
    check("revoked access token no longer resolves", (await resolveAccessToken(redeemed.tokens.access_token)) === null);

    const rotated = await rotateRefreshToken({ client, refreshToken: redeemed.tokens.refresh_token });
    check("refresh_token rotates to new tokens", rotated.ok);

    if (rotated.ok) {
      check(
        "rotated access token resolves before reuse",
        (await resolveAccessToken(rotated.tokens.access_token))?.user.id === user.id,
      );
      // Present the OLD (already-rotated) refresh token → reuse/theft detection.
      const reuse = await rotateRefreshToken({ client, refreshToken: redeemed.tokens.refresh_token });
      check("presenting a rotated refresh token is rejected", !reuse.ok);
      check(
        "reuse revokes the whole family — access token dies",
        (await resolveAccessToken(rotated.tokens.access_token)) === null,
      );
      const familyRotate = await rotateRefreshToken({ client, refreshToken: rotated.tokens.refresh_token });
      check("reuse revokes the whole family — newest refresh token dies", !familyRotate.ok);
    }
  }

  const code2 = await issueAuthorizationCode({
    clientId: client.clientId,
    userId: user.id,
    redirectUri,
    scope: "identify",
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  const badPkce = await redeemAuthorizationCode({ client, code: code2, redirectUri, codeVerifier: "wrong" });
  check("wrong PKCE verifier is rejected", !badPkce.ok);

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
