import { ConfirmForm } from "@/components/confirm-form";
import { ui } from "@/components/ui";
import { listInventory } from "@/db/queries/inventory";
import { SECTIONS } from "@/lib/sections";
import { formatAmount } from "@/lib/units";
import { requireUser } from "@/server/auth";
import { addStockAction, removeStockAction, setStockAction } from "./actions";
import { AddStockForm, EditStockForm } from "./stock-forms";

export default async function InventoryPage() {
  const user = await requireUser("/inventory");
  const rows = await listInventory(user.id);
  const sections = SECTIONS.map((section) => ({ section: section as string, rows: rows.filter((r) => r.section === section) })).filter(
    (s) => s.rows.length > 0,
  );

  return (
    <main className={ui.page}>
      <h1 className={`${ui.h1} mb-2`}>Inventory</h1>
      <p className="mb-4 text-neutral-600 dark:text-neutral-400">What’s on hand. The grocery list buys only what this doesn’t cover.</p>
      <AddStockForm action={addStockAction} />

      {sections.length === 0 ? (
        <div className={`${ui.card} text-center`}>
          <p>Nothing on hand yet. Add items above, or check items off your grocery list.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(({ section, rows: sectionRows }) => (
            <section key={section} aria-labelledby={`inv-${section.replace(/\W+/g, "-")}`}>
              <h2 id={`inv-${section.replace(/\W+/g, "-")}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {section}
              </h2>
              <ul className={`${ui.card} divide-y divide-neutral-100 p-0 dark:divide-neutral-800`}>
                {sectionRows.map((row) => {
                  const amount = formatAmount(row.unitKey, row.quantity, row.system);
                  const id = `${row.itemId}-${row.unitKey.replace(/[^a-z0-9]/gi, "-")}`;
                  return (
                    <li key={id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {amount} {row.name}
                        </span>
                        <ConfirmForm action={removeStockAction.bind(null, row.itemId, row.unitKey)} message={`Remove ${row.name} from your inventory?`}>
                          <button type="submit" aria-label={`Remove ${row.name}`} className="text-sm text-neutral-500 hover:underline">
                            Remove
                          </button>
                        </ConfirmForm>
                      </div>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">Edit amount</summary>
                        <EditStockForm id={id} name={row.name} current={amount} action={setStockAction.bind(null, row.itemId, row.unitKey)} />
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
