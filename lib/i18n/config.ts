/**
 * i18n configuration shared by both server and client code.
 *
 * Locale is selected per request from the `lang` cookie (set by the header
 * switcher), falling back to the browser's Accept-Language header, then to
 * {@link defaultLocale}. URLs are not localized — see lib/i18n/index.ts.
 */

export const locales = ["en", "zh-TW"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Human-readable label for each locale, used by the language switcher. */
export const localeNames: Record<Locale, string> = {
  en: "EN",
  "zh-TW": "中文",
};

/** Name of the cookie that stores the visitor's chosen locale. */
export const LOCALE_COOKIE = "lang";

/** Narrow an arbitrary string to a supported {@link Locale}. */
export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
