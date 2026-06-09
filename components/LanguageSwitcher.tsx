import { setLocale } from "@/app/actions/locale";
import { locales, localeNames, type Locale } from "@/lib/i18n/config";
import { Languages } from "lucide-react";

/**
 * Compact locale toggle for the header. A single button that posts the *other*
 * locale to the `setLocale` server action — so it shows "中文" while in English
 * and "EN" while in Chinese, swapping the language in one tap. Works without
 * client JS (it's a plain form), so it lives as a Server Component.
 *
 * Styled to match the header's idle nav links (same rounded-lg pill, padding,
 * type, and muted→ink hover) so it sits in the bar as one of them rather than
 * standing out as a differently-shaped control.
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
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-strong hover:text-ink"
      >
        <Languages size={16} />
        {localeNames[next]}
      </button>
    </form>
  );
}
