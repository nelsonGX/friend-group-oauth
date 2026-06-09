import { eq } from "drizzle-orm";
import { check, createTestDb, schema, summarize } from "./harness";
import { authenticateClient } from "../lib/oauth";
import {
  approveDevice,
  denyDevice,
  normalizeUserCode,
  pollDeviceAuthorization,
  startDeviceAuthorization,
} from "../lib/devices";
import { createZip } from "../lib/zip";

/** End-to-end verification of the browser-approved device flow against PGlite. */
async function main() {
  const db = await createTestDb();

  const [user] = await db
    .insert(schema.users)
    .values({ discordId: "222", username: "approver", allowed: true, inGuild: true })
    .returning();

  const redirectUris = ["https://myapp.com/callback", "http://localhost:3000/callback"];

  // --- happy path: start → pending → approve → credentials once → consumed ---
  const start = await startDeviceAuthorization({
    name: "Device App",
    redirectUris,
    scopes: ["identify", "roles"],
  });
  check("startDeviceAuthorization succeeds", start.ok);
  if (!start.ok) return summarize();

  const pendingPoll = await pollDeviceAuthorization(start.deviceCode);
  check("poll before approval is pending", pendingPoll.status === "pending");

  const wrongPoll = await pollDeviceAuthorization("not-a-real-device-code");
  check("poll with unknown device_code is invalid", wrongPoll.status === "invalid");

  const approve = await approveDevice(start.userCode, user);
  check("approveDevice succeeds", approve.ok);

  const approvedPoll = await pollDeviceAuthorization(start.deviceCode);
  check("poll after approval returns credentials", approvedPoll.status === "approved");

  if (approvedPoll.status === "approved") {
    const { clientId, clientSecret, redirectUris: gotUris, scopes } =
      approvedPoll.credentials;
    check("credentials include the requested redirect URIs", gotUris.length === 2);
    check("credentials echo the requested scopes", scopes.includes("roles"));
    check(
      "issued client authenticates with its secret",
      !!(await authenticateClient(clientId, clientSecret)),
    );

    // The app row exists, is owned by the approver, and is untrusted.
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.clientId, clientId))
      .limit(1);
    check("created client is owned by the approver", client?.ownerUserId === user.id);
    check("created client is not trusted", client?.trusted === false);
  }

  const replayPoll = await pollDeviceAuthorization(start.deviceCode);
  check("credentials cannot be retrieved twice", replayPoll.status === "invalid");

  // --- denial path ---
  const start2 = await startDeviceAuthorization({
    name: "Denied App",
    redirectUris,
    scopes: ["identify"],
  });
  if (start2.ok) {
    await denyDevice(start2.userCode);
    const deniedPoll = await pollDeviceAuthorization(start2.deviceCode);
    check("denied request polls as access_denied", deniedPoll.status === "denied");
  }

  // --- validation ---
  const badScope = await startDeviceAuthorization({
    name: "Bad",
    redirectUris,
    scopes: ["identify", "nonsense"],
  });
  check("unknown scope is rejected at start", !badScope.ok);

  const badUri = await startDeviceAuthorization({
    name: "Bad",
    redirectUris: ["not a url"],
    scopes: ["identify"],
  });
  check("invalid redirect_uri is rejected at start", !badUri.ok);

  const noUri = await startDeviceAuthorization({
    name: "Bad",
    redirectUris: [],
    scopes: ["identify"],
  });
  check("missing redirect_uri is rejected at start", !noUri.ok);

  // --- expiry ---
  const start3 = await startDeviceAuthorization({
    name: "Expiring App",
    redirectUris,
    scopes: ["identify"],
  });
  if (start3.ok) {
    await db
      .update(schema.deviceAuthorizations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.deviceAuthorizations.userCode, normalizeUserCode(start3.userCode)));
    const expiredPoll = await pollDeviceAuthorization(start3.deviceCode);
    check("expired request polls as expired_token", expiredPoll.status === "expired");
  }

  // --- skill bundle zips ---
  const zip = createZip([
    { name: "a/SKILL.md", content: "# hello" },
    { name: "a/reference.md", content: "ref" },
  ]);
  check("createZip emits a valid local-file-header signature", zip.readUInt32LE(0) === 0x04034b50);
  check("createZip ends with the EOCD signature", zip.readUInt32LE(zip.length - 22) === 0x06054b50);

  summarize();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
