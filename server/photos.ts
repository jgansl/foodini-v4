import "server-only";
import { PHOTO_TYPES } from "@/lib/photo-rules";
import { createClient } from "./supabase";

const BUCKET = "recipe-photos";

/** Uploads as the signed-in user; storage policies only allow paths under their own user id. */
export async function uploadPhoto(userId: string, recipeId: string, file: File): Promise<string> {
  const path = `${userId}/${recipeId}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function removePhoto(path: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("removePhoto failed", path, error);
}

/** Signed URLs valid for one hour, keyed by storage path. Missing or failed paths are omitted. */
export async function photoUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    console.error("photoUrls failed", error);
    return new Map();
  }
  return new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as [string, string]] : [])));
}
