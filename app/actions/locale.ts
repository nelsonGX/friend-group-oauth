"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persist the visitor's chosen locale in the `lang` cookie. Invoked from the
 * header language switcher form. The cookie is readable by the client (not
 * httpOnly) — it carries no secret, only a UI preference. Revalidating the
 * root layout re-renders the whole tree with the new locale.
 */
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale")?.toString();
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
