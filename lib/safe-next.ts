/** Returns `next` only if it is a same-site absolute path; otherwise `fallback`. Prevents open redirects. */
export function safeNext(next: string | null | undefined, fallback = "/recipes"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;
  return next;
}
