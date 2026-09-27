export type UnitKind = "count" | "volume" | "weight";

type UnitDef = { kind: UnitKind; abbreviation: boolean; aliases: string[] };

const UNITS: Record<string, UnitDef> = {
  tsp: { kind: "volume", abbreviation: true, aliases: ["tsp", "tsps", "teaspoon", "teaspoons"] },
  tbsp: { kind: "volume", abbreviation: true, aliases: ["tbsp", "tbsps", "tbs", "tbl", "tablespoon", "tablespoons"] },
  cup: { kind: "volume", abbreviation: false, aliases: ["c", "cup", "cups"] },
  "fl oz": { kind: "volume", abbreviation: true, aliases: ["fl oz", "floz", "fluid ounce", "fluid ounces"] },
  pint: { kind: "volume", abbreviation: false, aliases: ["pt", "pint", "pints"] },
  quart: { kind: "volume", abbreviation: false, aliases: ["qt", "quart", "quarts"] },
  gallon: { kind: "volume", abbreviation: false, aliases: ["gal", "gallon", "gallons"] },
  ml: { kind: "volume", abbreviation: true, aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"] },
  l: { kind: "volume", abbreviation: true, aliases: ["l", "liter", "liters", "litre", "litres"] },
  g: { kind: "weight", abbreviation: true, aliases: ["g", "gram", "grams", "gramme", "grammes"] },
  kg: { kind: "weight", abbreviation: true, aliases: ["kg", "kilogram", "kilograms"] },
  oz: { kind: "weight", abbreviation: true, aliases: ["oz", "ounce", "ounces"] },
  lb: { kind: "weight", abbreviation: true, aliases: ["lb", "lbs", "pound", "pounds"] },
  clove: { kind: "count", abbreviation: false, aliases: ["clove", "cloves"] },
  can: { kind: "count", abbreviation: false, aliases: ["can", "cans", "tin", "tins"] },
  jar: { kind: "count", abbreviation: false, aliases: ["jar", "jars"] },
  bag: { kind: "count", abbreviation: false, aliases: ["bag", "bags"] },
  bottle: { kind: "count", abbreviation: false, aliases: ["bottle", "bottles"] },
  box: { kind: "count", abbreviation: false, aliases: ["box", "boxes"] },
  carton: { kind: "count", abbreviation: false, aliases: ["carton", "cartons"] },
  tub: { kind: "count", abbreviation: false, aliases: ["tub", "tubs"] },
  package: { kind: "count", abbreviation: false, aliases: ["package", "packages", "pkg", "pkgs", "packet", "packets"] },
  bunch: { kind: "count", abbreviation: false, aliases: ["bunch", "bunches"] },
  head: { kind: "count", abbreviation: false, aliases: ["head", "heads"] },
  slice: { kind: "count", abbreviation: false, aliases: ["slice", "slices"] },
  stick: { kind: "count", abbreviation: false, aliases: ["stick", "sticks"] },
  sprig: { kind: "count", abbreviation: false, aliases: ["sprig", "sprigs"] },
  piece: { kind: "count", abbreviation: false, aliases: ["piece", "pieces", "pc", "pcs"] },
  pinch: { kind: "count", abbreviation: false, aliases: ["pinch", "pinches"] },
  dash: { kind: "count", abbreviation: false, aliases: ["dash", "dashes"] },
  handful: { kind: "count", abbreviation: false, aliases: ["handful", "handfuls"] },
};

const ALIASES = new Map<string, string>();
for (const [canonical, def] of Object.entries(UNITS)) {
  for (const alias of def.aliases) ALIASES.set(alias, canonical);
}

const stripDot = (token: string) => token.replace(/\.$/, "");
const TOLERANCE = 0.02;

/** Reads a unit from the start of `tokens`. Two-word units ("fl oz") win over one-word ones. */
export function matchUnit(tokens: string[]): { unit: string; consumed: number } | null {
  if (tokens.length >= 2) {
    const unit = ALIASES.get(`${stripDot(tokens[0])} ${stripDot(tokens[1])}`.toLowerCase());
    if (unit) return { unit, consumed: 2 };
  }
  if (tokens.length >= 1) {
    const token = stripDot(tokens[0]);
    // Capital T is the traditional abbreviation for tablespoon, lowercase t for teaspoon.
    const unit = token === "T" ? "tbsp" : token === "t" ? "tsp" : ALIASES.get(token.toLowerCase());
    if (unit) return { unit, consumed: 1 };
  }
  return null;
}

export function unitKind(unit: string): UnitKind {
  return UNITS[unit]?.kind ?? "count";
}

export function unitLabel(unit: string, quantity: number): string {
  const def = UNITS[unit];
  // Same tolerance as formatQuantity: 1.0000001 (float error) and 1.01 both display as "1".
  if (!def || def.abbreviation || quantity < 1 + TOLERANCE) return unit;
  return /(ch|sh|s|x)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

/** Formats a quantity for cooks: common fractions as glyphs, anything else to two decimals. */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1 / 8 - TOLERANCE) return String(Number(n.toPrecision(2)));
  const whole = Math.floor(n + TOLERANCE);
  const fraction = n - whole;
  if (Math.abs(fraction) < TOLERANCE) return String(whole);
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(fraction - value) < TOLERANCE) return whole > 0 ? `${whole} ${glyph}` : glyph;
  }
  return String(Math.round(n * 100) / 100);
}

export type UnitSystem = "us" | "metric";

// Millilitres per volume unit and grams per weight unit.
const TO_BASE: Record<string, number> = {
  tsp: 4.92892, tbsp: 14.7868, cup: 236.588, "fl oz": 29.5735, pint: 473.176, quart: 946.353, gallon: 3785.41,
  ml: 1, l: 1000, g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
};
const METRIC_UNITS = new Set(["ml", "l", "g", "kg"]);

/** Converts to a base amount: ml for volume, g for weight; each count unit stays its own unit. */
export function toBase(quantity: number, unit: string | null): { unitKey: string; amount: number; system: UnitSystem | null } {
  if (unit !== null && TO_BASE[unit] !== undefined) {
    return { unitKey: unitKind(unit), amount: quantity * TO_BASE[unit], system: METRIC_UNITS.has(unit) ? "metric" : "us" };
  }
  return { unitKey: `count:${unit ?? "each"}`, amount: quantity, system: null };
}

export function unitKeyForKind(kind: UnitKind): string {
  return kind === "count" ? "count:each" : kind;
}

const roundMetric = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

function show(quantity: number, unit: string | null, metric: boolean): string {
  const number = metric ? String(quantity) : formatQuantity(quantity);
  return unit ? `${number} ${unitLabel(unit, quantity)}` : number;
}

/** A readable amount for a base amount: 48 tsp → "1 cup", 1500 ml → "1.5 l". */
export function formatAmount(unitKey: string, amount: number, system: UnitSystem | null): string {
  if (unitKey === "volume") {
    if (system === "metric") return amount < 1000 ? show(roundMetric(amount), "ml", true) : show(round2(amount / 1000), "l", true);
    if (amount < TO_BASE.tbsp * 0.99) return show(amount / TO_BASE.tsp, "tsp", false);
    if (amount < (TO_BASE.cup / 4) * 0.99) return show(amount / TO_BASE.tbsp, "tbsp", false);
    return show(amount / TO_BASE.cup, "cup", false);
  }
  if (unitKey === "weight") {
    if (system === "metric") return amount < 1000 ? show(roundMetric(amount), "g", true) : show(round2(amount / 1000), "kg", true);
    if (amount < TO_BASE.lb * 0.99) return show(amount / TO_BASE.oz, "oz", false);
    return show(amount / TO_BASE.lb, "lb", false);
  }
  const unit = unitKey.slice("count:".length);
  return show(amount, unit === "each" ? null : unit, false);
}
