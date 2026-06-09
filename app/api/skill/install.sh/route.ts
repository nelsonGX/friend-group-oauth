import { buildInstallSh } from "@/lib/skill";

/**
 * POSIX shell installer for the integration skill, served so users can run
 * `curl -fsSL {APP_URL}/api/skill/install.sh | sh` to drop it into their
 * project's .claude/skills/. Public — contains only the base URL + generic spec.
 */
export async function GET() {
  return new Response(buildInstallSh(), {
    status: 200,
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
