import { buildSkillBundle, skillFileName } from "@/lib/skill";
import { createZip } from "@/lib/zip";

/**
 * Downloads the personalized coding-agent integration skill as a zip. Contains
 * only public information (this server's base URL + the generic spec) — no
 * secrets, which are issued later through the device flow — so no auth is needed.
 */
export async function GET() {
  const zip = createZip(buildSkillBundle());
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${skillFileName()}"`,
      "cache-control": "no-store",
    },
  });
}
