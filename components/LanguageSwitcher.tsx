import { setLocale } from "@/app/actions/locale";
import { locales, localeNames, type Locale } from "@/lib/i18n/config";

/**
 * Compact locale toggle for the header. A single button that posts the *other*
 * locale to the `setLocale` server action — so it shows "中文" while in English
 * and "EN" while in Chinese, swapping the language in one tap. Works without
 * client JS (it's a plain form), so it lives as a Server Component.
 */
export function LanguageSwitcher({
  active,
  label,
}: {
  active: Locale;
  label: string;
}) {
  // The language the button switches *to* — the one that isn't currently active.
  const next = locales.find((loc) => loc !== active) ?? active;

  return (
    <form action={setLocale} aria-label={label}>
      <button
        name="locale"
        value={next}
        className="rounded-full border border-border/60 bg-surface/50 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-ink"
      >
        {localeNames[next]}
      </button>
    </form>
  );
}
