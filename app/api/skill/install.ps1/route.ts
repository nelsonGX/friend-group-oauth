import { buildInstallPs1 } from "@/lib/skill";

/**
 * PowerShell installer for the integration skill (Windows), served so users can
 * run `irm {APP_URL}/api/skill/install.ps1 | iex` to drop it into their
 * project's .claude/skills/. Public — contains only the base URL + generic spec.
 */
export async function GET() {
  return new Response(buildInstallPs1(), {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
