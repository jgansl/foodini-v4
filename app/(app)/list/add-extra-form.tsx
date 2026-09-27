"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { AddExtraState } from "./actions";

export function AddExtraForm({ action }: { action: (prev: AddExtraState, formData: FormData) => Promise<AddExtraState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mb-6 flex flex-wrap gap-2" noValidate>
      <label htmlFor="extra-text" className="sr-only">
        Add an item
      </label>
      <input
        id="extra-text"
        name="text"
        placeholder="Add an item, e.g. paper towels or 2 lb apples"
        defaultValue={state?.text ?? ""}
        aria-invalid={!!state?.error}
        aria-describedby={state?.error ? "extra-error" : undefined}
        className={`${ui.input} mt-0 min-w-0 flex-1`}
      />
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state?.error && (
        <p id="extra-error" role="alert" className={`${ui.error} w-full`}>
          {state.error}
        </p>
      )}
    </form>
  );
}
