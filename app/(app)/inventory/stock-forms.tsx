"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { StockFormState } from "./actions";

type Action = (prev: StockFormState, formData: FormData) => Promise<StockFormState>;

export function AddStockForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mb-6 flex flex-wrap gap-2" noValidate>
      <label htmlFor="stock-text" className="sr-only">
        Add to inventory
      </label>
      <input
        id="stock-text"
        name="text"
        placeholder="Add to inventory, e.g. 2 lb flour"
        defaultValue={state?.text ?? ""}
        aria-invalid={!!state?.error}
        aria-describedby={state?.error ? "stock-error" : undefined}
        className={`${ui.input} mt-0 min-w-0 flex-1`}
      />
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state?.error && (
        <p id="stock-error" role="alert" className={`${ui.error} w-full`}>
          {state.error}
        </p>
      )}
    </form>
  );
}

export function EditStockForm({ id, name, current, action }: { id: string; name: string; current: string; action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
      <div className="min-w-32 flex-1">
        <label htmlFor={`amount-${id}`} className={ui.label}>
          Amount of {name}
        </label>
        <input
          id={`amount-${id}`}
          name="amount"
          defaultValue={state?.text ?? current}
          aria-invalid={!!state?.error}
          aria-describedby={state?.error ? `amount-${id}-error` : undefined}
          className={ui.input}
        />
      </div>
      <button type="submit" disabled={pending} className={ui.buttonSecondary}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && (
        <p id={`amount-${id}-error`} role="alert" className={`${ui.error} w-full`}>
          {state.error}
        </p>
      )}
    </form>
  );
}
