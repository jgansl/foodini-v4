"use client";

import { ui } from "@/components/ui";

export function DeleteRecipeButton({ action, title }: { action: (formData: FormData) => Promise<void>; title: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Delete “${title}”? This can’t be undone.`)) e.preventDefault();
      }}
    >
      <button type="submit" className={ui.buttonDanger}>
        Delete
      </button>
    </form>
  );
}
