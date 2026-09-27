import { SECTIONS, type Section } from "./sections";
import { formatAmount, formatQuantity, toBase, unitKeyForKind, unitLabel, type UnitKind, type UnitSystem } from "./units";

export type GroceryIngredient = {
  recipeTitle: string;
  entryServings: number;
  recipeServings: number;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  itemId: string | null;
  itemName: string | null;
  itemSection: string | null;
  itemUnitKind: UnitKind | null;
};
export type GroceryMark = { key: string; checked: boolean; checkedQty: number | null; hidden: boolean };
export type GroceryExtra = { id: string; name: string; quantity: number | null; unit: string | null; section: string | null; checked: boolean };
export type GroceryLine = {
  id: string;
  key: string;
  kind: "need" | "bought" | "extra";
  name: string;
  label: string;
  section: Section;
  recipes: string[];
  checked: boolean;
  hidden: boolean;
  shortfallBase: number | null;
  extraId: string | null;
};
export type GroceryList = { sections: { section: Section; lines: GroceryLine[] }[]; toBuy: number; checked: number; hiddenCount: number };

type Group = {
  key: string;
  name: string;
  section: Section;
  unitKey: string;
  system: UnitSystem | null;
  required: number | null;
  recipes: Set<string>;
};

const asSection = (s: string | null): Section => ((SECTIONS as readonly string[]).includes(s ?? "") ? (s as Section) : "other");

export function rawKey(rawText: string): string {
  return `raw:${rawText.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function groupIngredients(ingredients: GroceryIngredient[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const ing of ingredients) {
    const factor = ing.recipeServings > 0 ? ing.entryServings / ing.recipeServings : 1;
    let key: string;
    let base: ReturnType<typeof toBase> | null = null;
    if (ing.itemId !== null) {
      if (ing.quantity !== null) base = toBase(ing.quantity * factor, ing.unit);
      key = `item:${ing.itemId}:${base ? base.unitKey : unitKeyForKind(ing.itemUnitKind ?? "count")}`;
    } else {
      key = rawKey(ing.rawText);
    }
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: ing.itemId !== null ? (ing.itemName ?? ing.rawText) : ing.rawText,
        section: ing.itemId !== null ? asSection(ing.itemSection) : "other",
        unitKey: base?.unitKey ?? (ing.itemId !== null ? unitKeyForKind(ing.itemUnitKind ?? "count") : "count:each"),
        system: null,
        required: null,
        recipes: new Set(),
      };
      groups.set(key, group);
    }
    group.recipes.add(ing.recipeTitle);
    if (base) {
      group.required = (group.required ?? 0) + base.amount;
      if (base.system === "metric" || group.system === null) group.system = base.system ?? group.system;
    }
  }
  return groups;
}

const labelFor = (amount: string | null, name: string) => (amount ? `${amount} ${name}` : name);

export function buildGroceryList(
  ingredients: GroceryIngredient[],
  marks: GroceryMark[],
  extras: GroceryExtra[],
  opts: { showHidden?: boolean } = {},
): GroceryList {
  const markByKey = new Map(marks.map((m) => [m.key, m]));
  const lines: GroceryLine[] = [];
  let hiddenCount = 0;

  for (const group of groupIngredients(ingredients).values()) {
    const mark = markByKey.get(group.key);
    const hidden = mark?.hidden ?? false;
    if (hidden) hiddenCount++;
    if (hidden && !opts.showHidden) continue;
    const recipes = [...group.recipes].sort();
    const common = { key: group.key, name: group.name, section: group.section, recipes, hidden, extraId: null };
    const amount = (base: number) => formatAmount(group.unitKey, base, group.system);

    if (group.required === null) {
      const checked = mark?.checked ?? false;
      lines.push({ ...common, id: `${group.key}#${checked ? "bought" : "need"}`, kind: checked ? "bought" : "need", label: group.name, checked, shortfallBase: null });
      continue;
    }
    const bought = mark?.checked ? (mark.checkedQty ?? group.required) : 0;
    const shortfall = Math.max(0, group.required - bought);
    if (mark?.checked) {
      lines.push({ ...common, id: `${group.key}#bought`, kind: "bought", label: labelFor(amount(bought), group.name), checked: true, shortfallBase: null });
    }
    if (shortfall > group.required * 1e-6) {
      lines.push({ ...common, id: `${group.key}#need`, kind: "need", label: labelFor(amount(shortfall), group.name), checked: false, shortfallBase: shortfall });
    }
  }

  for (const extra of extras) {
    const amountText =
      extra.quantity !== null ? `${formatQuantity(extra.quantity)}${extra.unit ? ` ${unitLabel(extra.unit, extra.quantity)}` : ""}` : null;
    lines.push({
      id: `extra:${extra.id}`,
      key: `extra:${extra.id}`,
      kind: "extra",
      name: extra.name,
      label: labelFor(amountText, extra.name),
      section: asSection(extra.section),
      recipes: [],
      checked: extra.checked,
      hidden: false,
      shortfallBase: null,
      extraId: extra.id,
    });
  }

  const sections = SECTIONS.map((section) => ({
    section,
    lines: lines
      .filter((l) => l.section === section)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name)),
  })).filter((s) => s.lines.length > 0);

  const visible = sections.flatMap((s) => s.lines);
  return {
    sections,
    toBuy: visible.filter((l) => !l.checked && !l.hidden).length,
    checked: visible.filter((l) => l.checked && !l.hidden).length,
    hiddenCount,
  };
}
