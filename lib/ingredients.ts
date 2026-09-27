import { formatQuantity, matchUnit, unitKind, unitLabel } from "./units";

export type ParsedIngredient = {
  raw: string;
  quantity: number | null;
  unit: string | null;
  /** Lowercased ingredient name; null when the line could not be read (kept as raw text). */
  name: string | null;
  note: string | null;
};

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5",
  "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};
const FRACTION_CHARS = new RegExp(`(\\d)?([${Object.keys(UNICODE_FRACTIONS).join("")}])`, "g");

const NUMBER = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
// A number, optionally a range ("2-3", "2 to 3"), followed by whitespace, a letter or the end.
const QUANTITY = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|—|to)\s*(${NUMBER}))?(?=\s|[a-z]|$)\s*`, "i");
const TO_TASTE = /[,\s]*\bto taste\b\.?$/i;
const SIZE_WORDS = new Set(["small", "medium", "large", "extra-large", "big"]);
// A size before the item or its container: "14-ounce cans", "400g tin", "5 lb bag", "9-inch pie crust".
const CONTAINER_SIZE = /^(\d+(?:\.\d+)?\s?-?\s?(?:ounces?|oz|grams?|g|kg|ml|l|lbs?|pounds?|inch(?:es)?|in|"))\.?\s+(?=\S)/i;
// Only these count units are items in their own right when nothing follows them ("2 cloves" is the spice).
const BARE_COUNT_ITEMS = new Set(["clove"]);
// Words that describe a count-unit item rather than name another ingredient ("whole cloves", not "whole" × cloves).
const DESCRIPTORS = new Set(["whole", "ground", "dried", "fresh", "large", "small", "medium"]);
// Count units that genuinely follow an item name ("garlic cloves", "thyme sprigs"). Not bag/stick/piece:
// "tea bags" and "fish sticks" are items, not containers of tea or fish.
const TRAILING_UNITS = new Set(["clove", "sprig", "head", "bunch", "slice"]);

function expandUnicodeFractions(s: string): string {
  return s
    .replace(/⁄/g, "/")
    .replace(FRACTION_CHARS, (_, digit: string | undefined, glyph: string) => `${digit ? `${digit} ` : ""}${UNICODE_FRACTIONS[glyph]}`);
}

function parseNumber(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .reduce((total, part) => {
      if (!part.includes("/")) return total + Number(part);
      const [numerator, denominator] = part.split("/").map(Number);
      return total + numerator / denominator;
    }, 0);
}

export function parseIngredient(raw: string): ParsedIngredient {
  const text = raw.replace(/\s+/g, " ").trim();
  const unread: ParsedIngredient = { raw: text, quantity: null, unit: null, name: null, note: null };
  if (!text || text.endsWith(":")) return unread;

  const parenNotes: string[] = [];
  let rest = expandUnicodeFractions(text)
    .replace(/\(([^)]*)\)/g, (_, inner: string) => {
      if (inner.trim()) parenNotes.push(inner.trim());
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  let quantity: number | null = null;
  const q = QUANTITY.exec(rest);
  if (q) {
    // "1-1/2" is a mixed number (1½), not the range 1 to ½. Otherwise, for a range buy for the upper bound.
    const mixed = q[2] !== undefined && /^\d+$/.test(q[1].trim()) && /^\d+\/\d+$/.test(q[2].trim()) && parseNumber(q[2]) < 1;
    const value = mixed ? parseNumber(q[1]) + parseNumber(q[2]) : parseNumber(q[2] ?? q[1]);
    if (Number.isFinite(value) && value > 0) quantity = value;
    rest = rest.slice(q[0].length);
  } else if (/^(a|an)\s/i.test(rest)) {
    quantity = 1;
    rest = rest.replace(/^(a|an)\s+/i, "");
  }

  let unit: string | null = null;
  let unitWord: string | null = null;
  let containerNote: string | null = null;
  if (quantity !== null) {
    rest = rest.replace(/^x\s+/i, "");
    const size = CONTAINER_SIZE.exec(rest);
    if (size) {
      const tokens = rest.slice(size[0].length).split(" ");
      const container = matchUnit(tokens);
      if (container && unitKind(container.unit) === "count") {
        containerNote = size[1].replace(/\s+/g, "");
        unit = container.unit;
        unitWord = tokens.slice(0, container.consumed).join(" ");
        rest = tokens.slice(container.consumed).join(" ");
      } else {
        containerNote = size[1].replace(/\s+/g, "");
        rest = tokens.join(" ");
      }
    }
    if (unit === null && containerNote === null) {
      const tokens = rest.split(" ");
      const match = matchUnit(tokens);
      if (match) {
        unit = match.unit;
        unitWord = tokens.slice(0, match.consumed).join(" ");
        rest = tokens.slice(match.consumed).join(" ");
      }
    }
  }
  rest = rest.replace(/^of\s+/i, "");

  const trailingNotes: string[] = [];
  if (TO_TASTE.test(rest)) {
    rest = rest.replace(TO_TASTE, "");
    trailingNotes.push("to taste");
  }

  let commaNote: string | null = null;
  const comma = rest.indexOf(",");
  if (comma >= 0) {
    commaNote = rest.slice(comma + 1).trim() || null;
    rest = rest.slice(0, comma);
  }

  const words = rest.trim().split(" ").filter(Boolean);
  let sizeNote: string | null = null;
  if (words.length > 1 && SIZE_WORDS.has(words[0].toLowerCase())) sizeNote = words.shift()!.toLowerCase();

  let name = words.join(" ").toLowerCase() || null;
  // "3 garlic cloves" → 3 clove garlic, matching "3 cloves garlic". Not "whole cloves", which is the item.
  if (quantity !== null && unit === null && name !== null && words.length >= 2) {
    const last = matchUnit([words[words.length - 1]]);
    const onlyDescriptors = words.slice(0, -1).every((w) => DESCRIPTORS.has(w.toLowerCase()));
    if (last && TRAILING_UNITS.has(last.unit) && !onlyDescriptors) {
      unit = last.unit;
      name = words.slice(0, -1).join(" ").toLowerCase();
    }
  }
  // "2 cloves" means the spice: only whitelisted count units become the item when nothing follows them.
  if (name === null && unit !== null && unitWord !== null && BARE_COUNT_ITEMS.has(unit)) {
    name = unitWord.toLowerCase();
    unit = null;
  }
  const notes = [containerNote, sizeNote, ...parenNotes, commaNote, ...trailingNotes].filter((n): n is string => Boolean(n));
  return { raw: text, quantity, unit, name, note: notes.length ? notes.join(", ") : null };
}

/** Renders an ingredient scaled by `factor`. At factor 1, or when there is no quantity, shows the original line. */
export function formatIngredient(p: ParsedIngredient, factor = 1): string {
  if (factor === 1 || p.quantity === null) return p.raw;
  const scaled = p.quantity * factor;
  const main = [formatQuantity(scaled), p.unit ? unitLabel(p.unit, scaled) : null, p.name].filter(Boolean).join(" ");
  return p.note ? `${main} (${p.note})` : main;
}

// Words that end in "s" but are already singular.
const INVARIANT = new Set(["molasses", "couscous", "hummus", "asparagus", "citrus", "swiss", "grits", "series", "species"]);

function singularize(word: string): string {
  if (word.length <= 3 || INVARIANT.has(word)) return word;
  if (/(eaves|oaves|alves)$/.test(word)) return `${word.slice(0, -3)}f`;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|oes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Key used to match items: lowercase, punctuation removed, whitespace collapsed, last word singular. */
export function normalizeItemName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "";
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(" ");
}
