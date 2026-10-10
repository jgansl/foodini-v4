"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type TabId = "ingredients" | "instructions";
const TABS: { id: TabId; label: string }[] = [
  { id: "ingredients", label: "Ingredients" },
  { id: "instructions", label: "Instructions" },
];

/**
 * Ingredients and instructions: tabs on phones, side by side from the md breakpoint up.
 * Both panels stay mounted (the inactive one is only hidden with CSS on narrow screens),
 * so state such as the scaled servings survives switching tabs.
 */
export function RecipeTabs({ ingredients, instructions }: { ingredients: ReactNode; instructions: ReactNode | null }) {
  const [active, setActive] = useState<TabId>("ingredients");
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ ingredients: null, instructions: null });

  if (!instructions) return <div className="max-w-xl">{ingredients}</div>;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === active);
    const next =
      event.key === "ArrowRight" ? TABS[(index + 1) % TABS.length]
      : event.key === "ArrowLeft" ? TABS[(index - 1 + TABS.length) % TABS.length]
      : event.key === "Home" ? TABS[0]
      : event.key === "End" ? TABS[TABS.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  }

  const panelClass = (id: TabId) => (active === id ? "" : "max-md:hidden");

  return (
    <div>
      <div role="tablist" aria-label="Recipe" className="mb-4 flex border-b border-neutral-200 md:hidden dark:border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={onKeyDown}
            className="-mb-px flex-1 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-neutral-600 aria-selected:border-emerald-700 aria-selected:text-emerald-700 dark:text-neutral-400 dark:aria-selected:border-emerald-400 dark:aria-selected:text-emerald-400"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="grid gap-8 md:grid-cols-[2fr_3fr]">
        <div role="tabpanel" id="panel-ingredients" aria-labelledby="tab-ingredients" className={panelClass("ingredients")}>
          {ingredients}
        </div>
        <div role="tabpanel" id="panel-instructions" aria-labelledby="tab-instructions" className={panelClass("instructions")}>
          {instructions}
        </div>
      </div>
    </div>
  );
}
