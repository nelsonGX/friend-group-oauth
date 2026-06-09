import { setLocale } from "@/app/actions/locale";
import { locales, localeNames, type Locale } from "@/lib/i18n/config";

/**
 * Compact locale toggle for the header. Posts to the `setLocale` server action,
 * which sets the `lang` cookie and re-renders the tree. Works without client JS
 * (it's a plain form), so it lives as a Server Component.
 */
export function LanguageSwitcher({
  active,
  label,
}: {
  active: Locale;
  label: string;
}) {
  return (
    <form
      action={setLocale}
      aria-label={label}
      className="flex items-center rounded-full border border-border/60 bg-surface/50 p-0.5 text-xs"
    >
      {locales.map((loc) => {
        const isActive = loc === active;
        return (
          <button
            key={loc}
            name="locale"
            value={loc}
            aria-pressed={isActive}
            disabled={isActive}
            className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
              isActive
                ? "bg-surface-strong text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            {localeNames[loc]}
          </button>
        );
      })}
    </form>
  );
}
