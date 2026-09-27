"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { EntryEditState } from "./actions";

export function EntryEditor({
  entryId,
  servings,
  label,
  action,
}: {
  entryId: string;
  servings: number;
  label: string | null;
  action: (prev: EntryEditState, formData: FormData) => Promise<EntryEditState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
      <div className="w-24">
        <label htmlFor={`entry-${entryId}-servings`} className={ui.label}>
          Servings
        </label>
        <input id={`entry-${entryId}-servings`} name="servings" type="number" inputMode="decimal" min={0.5} max={100} step={0.5} defaultValue={servings} aria-invalid={!!errors.servings} className={ui.input} />
      </div>
      <div className="min-w-32 flex-1">
        <label htmlFor={`entry-${entryId}-label`} className={ui.label}>
          Label
        </label>
        <input id={`entry-${entryId}-label`} name="label" maxLength={40} defaultValue={label ?? ""} aria-invalid={!!errors.label} className={ui.input} />
      </div>
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
      {(errors.servings || errors.label) && <p className={`${ui.error} w-full`}>{errors.servings ?? errors.label}</p>}
      {state?.saved && (
        <p role="status" className={`${ui.hint} w-full`}>
          Saved.
        </p>
      )}
    </form>
  );
}
