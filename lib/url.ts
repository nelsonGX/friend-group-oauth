/**
 * Restrict post-login redirects to local, same-app paths to prevent open
 * redirects. Anything that isn't a single-slash-prefixed path falls back to
 * the default.
 */
export function sanitizeReturnPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) return fallback;
  // Must start with exactly one "/" (reject "//host" and "/\host" and absolute URLs).
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
