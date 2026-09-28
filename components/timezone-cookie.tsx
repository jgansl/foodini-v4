"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { timeZoneChangesToday } from "@/lib/dates";

/**
 * Saves the browser's time zone in a cookie so the server knows the user's "today", and re-renders
 * when the server rendered with a zone (or the UTC fallback) that gives a different date. The server
 * passes the zone it actually used, because a request can leave before the cookie is written.
 */
export function TimezoneCookie({ serverTimeZone }: { serverTimeZone: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const current = document.cookie.split("; ").find((c) => c.startsWith("tz="))?.slice(3);
    if (current !== encodeURIComponent(tz)) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    }
    if (timeZoneChangesToday(tz, serverTimeZone)) router.refresh();
  }, [router, serverTimeZone]);
  return null;
}
