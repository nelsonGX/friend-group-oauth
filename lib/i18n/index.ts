import { cookies, headers } from "next/headers";
import en, { type Dictionary } from "./dictionaries/en";
import zhTW from "./dictionaries/zh-TW";
import { type Locale, LOCALE_COOKIE, defaultLocale, isLocale } from "./config";

/**
 * Server-side locale resolution and dictionary loading. Locale is read from the
 * `lang` cookie first; if unset (e.g. a first visit), we fall back to the
 * browser's Accept-Language header, then to {@link defaultLocale}.
 *
 * Reading cookies/headers opts a route into dynamic rendering — every page here
 * is already dynamic (they call getCurrentUser()), so this costs nothing extra.
 */

const dictionaries: Record<Locale, Dictionary> = {
  en,
  "zh-TW": zhTW,
};

/** Best-effort match of an Accept-Language header to a supported locale. */
function matchAcceptLanguage(header: string | null): Locale {
  if (!header) return defaultLocale;
  // We only ship English and Traditional Chinese, so any Chinese tag maps to
  // zh-TW; everything else falls through to the default.
  const tags = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    if (tag.startsWith("zh")) return "zh-TW";
    if (tag.startsWith("en")) return "en";
  }
  return defaultLocale;
}

/** Resolve the active locale for the current request. */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const acceptLanguage = (await headers()).get("accept-language");
  return matchAcceptLanguage(acceptLanguage);
}

/** Resolve the active locale and its dictionary in one call. */
export async function getDictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
