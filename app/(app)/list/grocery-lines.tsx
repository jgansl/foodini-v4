"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ui } from "@/components/ui";
import { useOnline } from "@/components/use-online";
import type { GroceryLine } from "@/lib/grocery";
import { applyPending, enqueue, removeSynced, type ListChange, type SyncResult } from "@/lib/offline-queue";
import { hideLineAction, removeExtraAction } from "./actions";
import { loadQueue, loadSnapshot, saveQueue, saveSnapshot, type Snapshot } from "./offline-store";

type Section = Snapshot["sections"][number];

export function GroceryLines({ userId, week, sections, generatedAt }: { userId: string; week: string; sections: Section[]; generatedAt: string }) {
  const router = useRouter();
  const online = useOnline();
  const [base, setBase] = useState<Snapshot>({ week, sections, generatedAt });
  const [queue, setQueue] = useState<ListChange[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const queueRef = useRef<ListChange[]>([]);
  const flushing = useRef(false);

  // Show the newest copy of the list: this render from the server, or a newer one saved on the device
  // (a page served by the service worker carries the list from when it was cached).
  useEffect(() => {
    let cancelled = false;
    const fromServer: Snapshot = { week, sections, generatedAt };
    (async () => {
      const saved = await loadSnapshot(userId, week);
      if (cancelled) return;
      if (saved && saved.generatedAt > generatedAt) setBase(saved);
      else {
        setBase(fromServer);
        await saveSnapshot(userId, fromServer);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, week, sections, generatedAt]);

  const storeQueue = useCallback(
    async (next: ListChange[]) => {
      queueRef.current = next;
      setQueue(next);
      await saveQueue(userId, next);
    },
    [userId],
  );

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine || queueRef.current.length === 0) return;
    flushing.current = true;
    const batch = queueRef.current;
    try {
      const response = await fetch("/api/grocery/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: batch }),
      });
      if (response.status === 401) {
        setMessage("Sign in again to sync your changes.");
        return;
      }
      if (response.status === 400) {
        setMessage("Some changes couldn't be saved.");
        await storeQueue(removeSynced(queueRef.current, batch));
        return;
      }
      if (!response.ok) return;
      const { results } = (await response.json()) as { results: SyncResult[] };
      if (results.some((r) => r.status === "invalid")) setMessage("Some changes couldn't be saved.");
      // Keep showing the synced state until the server's re-render arrives.
      setBase((b) => ({ ...b, sections: applyPending(b.sections, batch, week) }));
      await storeQueue(removeSynced(queueRef.current, batch));
      router.refresh();
    } catch {
      // Offline or unreachable: keep the queue and try again on the next online, focus or load.
    } finally {
      flushing.current = false;
    }
  }, [router, storeQueue, week]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadQueue(userId);
      if (cancelled) return;
      queueRef.current = saved;
      setQueue(saved);
      void flush();
    })();
    const retry = () => void flush();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [userId, flush]);

  // `eventTime` is the input event's timeStamp; with timeOrigin it gives the tap's wall-clock time.
  async function toggle(line: GroceryLine, eventTime: number) {
    const at = Math.round(performance.timeOrigin + eventTime);
    const change: ListChange = line.extraId
      ? { kind: "extra", week, id: line.extraId, checked: !line.checked, at }
      : { kind: "line", week, key: line.key, checked: !line.checked, at };
    setMessage(null);
    await storeQueue(enqueue(queueRef.current, change));
    void flush();
  }

  const shown = useMemo(() => applyPending(base.sections, queue, week), [base, queue, week]);
  const pending = queue.length;

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="space-y-2 text-sm empty:hidden">
        {!online && (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            You’re offline. Check-offs are saved on this device and sync when you’re back online.
          </p>
        )}
        {pending > 0 && (
          <p role="status" className="text-neutral-600 dark:text-neutral-400">
            {pending} change{pending === 1 ? "" : "s"} waiting to sync
          </p>
        )}
        {message && (
          <p role="alert" className={ui.error}>
            {message}
          </p>
        )}
      </div>
      {shown.map(({ section, lines }) => (
        <section key={section} aria-labelledby={`section-${section}`}>
          <h2 id={`section-${section}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {section}
          </h2>
          <ul className={`${ui.card} divide-y divide-neutral-100 p-0 dark:divide-neutral-800`}>
            {lines.map((line) => (
              <li key={line.id} className={`flex items-center gap-3 px-4 py-3 ${line.hidden ? "opacity-50" : ""}`}>
                <input
                  id={`line-${line.id}`}
                  type="checkbox"
                  checked={line.checked}
                  onChange={(e) => void toggle(line, e.timeStamp)}
                  className="size-5 shrink-0 accent-emerald-700"
                />
                <label htmlFor={`line-${line.id}`} className="min-w-0 flex-1">
                  <span className={line.checked ? "text-neutral-500 line-through" : ""}>{line.label}</span>
                  {line.recipes.length > 0 && <span className="block truncate text-xs text-neutral-500">for {line.recipes.join(", ")}</span>}
                </label>
                {line.extraId ? (
                  <form action={removeExtraAction.bind(null, line.extraId)}>
                    <button type="submit" disabled={!online} aria-label={`Remove ${line.name}`} className="text-sm text-neutral-500 hover:underline disabled:opacity-40">
                      Remove
                    </button>
                  </form>
                ) : (
                  <form action={hideLineAction.bind(null, week, line.key, !line.hidden)}>
                    <button
                      type="submit"
                      disabled={!online}
                      aria-label={`${line.hidden ? "Unhide" : "Hide"} ${line.name}`}
                      className="text-sm text-neutral-500 hover:underline disabled:opacity-40"
                    >
                      {line.hidden ? "Unhide" : "Hide"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
