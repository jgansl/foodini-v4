export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types and the file extension used when storing them. */
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function checkPhoto(file: { size: number; type: string } | null): { ok: true } | { ok: false; message: string } {
  if (!file) return { ok: true };
  if (!Object.hasOwn(PHOTO_TYPES, file.type)) return { ok: false, message: "Use a JPEG, PNG or WebP image." };
  if (file.size > PHOTO_MAX_BYTES) return { ok: false, message: "Photos must be 5 MB or smaller." };
  return { ok: true };
}
