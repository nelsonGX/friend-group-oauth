import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import type { User } from "@/db/schema";

/** Require an authenticated admin; redirect otherwise. Returns the admin user. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/admin");
  if (!user.isAdmin) redirect("/dashboard");
  return user;
}
