import "server-only";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/allowed-email";
import { createClient } from "./supabase";

export type SessionUser = { id: string; email: string | null };

export async function getUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const email = typeof claims.email === "string" ? claims.email : null;
  // Defence in depth: a session created directly against Supabase Auth (bypassing the login form)
  // still has to belong to an allowed address.
  if (!email || !isAllowedEmail(email, process.env.ALLOWED_EMAILS)) return null;
  return { id: claims.sub, email };
}

/** The verified user, or a redirect to /login that returns to `next` afterwards. */
export async function requireUser(next = "/recipes"): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
