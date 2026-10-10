// Browsers strip tab/newline when parsing URLs, so "/\t/evil.example" would become "//evil.example".
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Returns `next` only if it is a same-site absolute path; otherwise `fallback`. Prevents open redirects. */
export function safeNext(next: string | null | undefined, fallback = "/recipes"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (CONTROL_CHARS.test(next) || CONTROL_CHARS.test(decoded)) return fallback;
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;
  return next;
}
