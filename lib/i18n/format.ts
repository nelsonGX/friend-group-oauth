/**
 * Tiny `{placeholder}` interpolation for dictionary strings. Kept dependency-
 * and "server-only"-free so it can run in both server and client components.
 *
 *   format("Granted {amount} credits to {user}.", { amount: 5, user: "ren" })
 *   // -> "Granted 5 credits to ren."
 */
export function format(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}
