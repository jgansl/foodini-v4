export function isAllowedEmail(email: string, allowList: string | undefined): boolean {
  const allowed = (allowList ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
