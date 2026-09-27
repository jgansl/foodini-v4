"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Saves the browser's time zone in a cookie so the server knows the user's "today". */
export function TimezoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.split("; ").find((c) => c.startsWith("tz="))?.slice(3);
    if (!tz || current === encodeURIComponent(tz)) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    // Re-render server components that already used the UTC fallback.
    router.refresh();
  }, [router]);
  return null;
}
