import "server-only";
import { cookies } from "next/headers";
import { todayIn } from "@/lib/dates";

/** The time zone from the `tz` cookie set by <TimezoneCookie />, or null if it's missing or malformed. */
export async function getTimeZone(): Promise<string | null> {
  const raw = (await cookies()).get("tz")?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Today's date in the user's time zone, else UTC. */
export async function getToday(): Promise<string> {
  return todayIn((await getTimeZone()) ?? undefined);
}
