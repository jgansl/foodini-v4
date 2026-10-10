"use server";

import { z } from "zod";
import { isAllowedEmail } from "@/lib/allowed-email";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/server/supabase";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; email: string; message: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!z.email().safeParse(email).success) return { status: "error", email, message: "Enter a valid email address." };
  if (!isAllowedEmail(email, process.env.ALLOWED_EMAILS)) {
    return { status: "error", email, message: "This email isn't allowed to sign in." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("signInWithOtp failed", error);
    return { status: "error", email, message: "Couldn't send the link. Try again in a minute." };
  }
  return { status: "sent", email };
}
