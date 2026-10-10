"use client";

import { useEffect, useRef } from "react";
import { ui } from "@/components/ui";

/**
 * A dropdown of checkboxes inside the search form. Picking a tag submits the form, so the filter is a plain
 * GET (`?tag=a&tag=b`) and still works before JavaScript loads (use the Search button then).
 */
export function TagFilter({ tags, selected }: { tags: string[]; selected: string[] }) {
  const details = useRef<HTMLDetailsElement>(null);

  // Close on a click outside or Escape, like a menu.
  useEffect(() => {
    const close = () => details.current?.removeAttribute("open");
    const onPointer = (e: PointerEvent) => {
      if (details.current && !details.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && details.current?.open) {
        close();
        details.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={details} className="relative">
      <summary className={`${ui.buttonSecondary} cursor-pointer list-none whitespace-nowrap`}>
        Tags{selected.length > 0 ? ` (${selected.length})` : ""}
        <span aria-hidden className="ml-2 text-xs">
          ▾
        </span>
      </summary>
      <fieldset className="absolute right-0 z-20 mt-2 max-h-72 w-56 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
        <legend className="sr-only">Filter by tag</legend>
        {tags.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <input
              type="checkbox"
              name="tag"
              value={t}
              defaultChecked={selected.includes(t)}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="size-4 accent-emerald-700"
            />
            <span className="min-w-0 truncate">{t}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
