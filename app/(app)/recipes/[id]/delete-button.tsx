import { ConfirmForm } from "@/components/confirm-form";
import { ui } from "@/components/ui";

export function DeleteRecipeButton({ action, title, plannedCount }: { action: (formData: FormData) => Promise<void>; title: string; plannedCount: number }) {
  const planned =
    plannedCount > 0 ? ` It’s in ${plannedCount} planned meal${plannedCount === 1 ? "" : "s"}, which will be removed too.` : "";
  return (
    <ConfirmForm action={action} message={`Delete “${title}”?${planned} This can’t be undone.`}>
      <button type="submit" className={ui.buttonDanger}>
        Delete
      </button>
    </ConfirmForm>
  );
}
