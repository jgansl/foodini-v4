"use client";

import { useEffect } from "react";
import { ui } from "@/components/ui";

export default function PlanError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>Something went wrong</h1>
      <p className="mt-2">We couldn’t load your plan.</p>
      <button type="button" onClick={() => retry()} className={`${ui.button} mt-4`}>
        Try again
      </button>
    </main>
  );
}
