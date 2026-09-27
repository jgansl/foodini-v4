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
  if (!def || def.abbreviation || quantity <= 1) return unit;
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
const TOLERANCE = 0.02;

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
