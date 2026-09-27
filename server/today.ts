import "server-only";
import { cookies } from "next/headers";
import { todayIn } from "@/lib/dates";

/** Today's date in the user's time zone (from the `tz` cookie set by <TimezoneCookie />), else UTC. */
export async function getToday(): Promise<string> {
  const tz = (await cookies()).get("tz")?.value;
  return todayIn(tz ? decodeURIComponent(tz) : undefined);
}
