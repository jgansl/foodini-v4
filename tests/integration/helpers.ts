import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TestUser = { id: string; email: string; password: string };

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = () => createClient(url(), process.env.SUPABASE_SECRET_KEY!, noSession);
export const anonClient = () => createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, noSession);

/** Creates a confirmed throwaway user with a random password (local Supabase only). */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw error;
}

export async function signedInClient(user: TestUser): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}
