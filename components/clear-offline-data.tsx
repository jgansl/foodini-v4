"use client";

import { useEffect } from "react";
import { clearOfflineData } from "@/app/(app)/list/offline-store";

/** Rendered on /login after an explicit sign-out: removes lists saved on this device. */
export function ClearOfflineData() {
  useEffect(() => {
    void clearOfflineData();
  }, []);
  return null;
}
