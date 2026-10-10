"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/server/supabase";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?signedOut=1");
}
