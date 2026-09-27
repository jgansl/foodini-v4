/** Entries are full addresses ("me@example.com") or whole domains ("@example.com"). */
export function isAllowedEmail(email: string, allowList: string | undefined): boolean {
  const address = email.trim().toLowerCase();
  const allowed = (allowList ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.some((entry) => (entry.startsWith("@") ? address.endsWith(entry) : address === entry));
}
