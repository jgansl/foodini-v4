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
  // After a failed save, show what was typed; after a successful one, the saved values.
  const values = state && !state.saved ? state.values : { servings: String(servings), label: label ?? "" };
  const errorId = `entry-${entryId}-error`;
  const message = errors.servings ?? errors.label;
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
      <div className="w-24">
        <label htmlFor={`entry-${entryId}-servings`} className={ui.label}>
          Servings
        </label>
        <input
          id={`entry-${entryId}-servings`}
          name="servings"
          type="number"
          inputMode="decimal"
          min={0.5}
          max={100}
          step={0.5}
          defaultValue={values.servings}
          aria-invalid={!!errors.servings}
          aria-describedby={errors.servings ? errorId : undefined}
          className={ui.input}
        />
      </div>
      <div className="min-w-32 flex-1">
        <label htmlFor={`entry-${entryId}-label`} className={ui.label}>
          Label
        </label>
        <input
          id={`entry-${entryId}-label`}
          name="label"
          maxLength={40}
          defaultValue={values.label}
          aria-invalid={!!errors.label}
          aria-describedby={errors.label ? errorId : undefined}
          className={ui.input}
        />
      </div>
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
      {message && (
        <p id={errorId} role="alert" className={`${ui.error} w-full`}>
          {message}
        </p>
      )}
      {state?.saved && (
        <p role="status" className={`${ui.hint} w-full`}>
          Saved.
        </p>
      )}
    </form>
  );
}
