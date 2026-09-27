# Phase 1: Foundation and Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can build a recipe box: create, edit, delete, search and tag recipes; import them from a URL; attach a photo; and scale servings. Every ingredient line is parsed into quantity, unit and item.

**Architecture:** Next.js 16 App Router on the existing scaffold. Server Components read Postgres through Drizzle, and Server Actions write through Drizzle after Zod validation. Supabase provides Postgres, magic-link auth (cookies through `@supabase/ssr`) and photo storage. All domain logic (units, the ingredient parser, sections, form validation, JSON-LD import, safe page fetching) lives in pure modules in `lib/` with Vitest unit tests. Query helpers in `db/queries/` get integration tests against a local Supabase, and Playwright covers the main flows end to end.

**Tech Stack:** Next.js 16.3, React 19.2, Tailwind 4, TypeScript 5, Supabase (CLI 2.x, `@supabase/ssr` 0.12, `@supabase/supabase-js` 2.x), Drizzle ORM 0.45 + drizzle-kit 0.31 + `postgres` 3.4, Zod 4, Vitest 5, Playwright 1.63, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-09-27-foodini-meal-planner-design.md`. Phase 1 covers §2 (architecture), §3 (only the `items`, `recipes` and `recipe_ingredients` tables), §4 (`/login` and `/recipes*`, including URL import), §8 and §9 as they apply to recipes.

## Global Constraints

- **Next.js 16 conventions** (read `node_modules/next/dist/docs/` when in doubt):
  - The request interceptor is `proxy.ts` exporting `proxy`; there is no `middleware.ts`.
  - `params` and `searchParams` are Promises; type pages with the global `PageProps<'/route'>` helper.
  - `error.tsx` receives `{ error, retry }`, not `reset`.
  - The Server Action body limit is set with `experimental.serverActions.bodySizeLimit`.
- **No `use cache` anywhere.** All data is per user and changes often; pages render per request.
- **Every Server Action and every query helper verifies the user.** Actions call `requireUser()`, and every query helper takes `userId` and filters by it. Drizzle connects as the `postgres` role, which **bypasses row-level security**, so for the Drizzle path this filter is the enforcement. Row-level security protects the Supabase Data API, which the public publishable key can reach.
- **Row-level security on every table:** `user_id = (select auth.uid())` for all operations, granted to `authenticated` only; `anon` gets nothing.
- **Items:** unique per user by a normalized `key` (lowercase, whitespace collapsed, last word singularized). This implements the spec's "unique (user_id, lower(name)) with simple singular/plural folding".
- **`unit_kind`** is `count | volume | weight`, set from the first unit an item is seen with; `count` when there is no unit.
- **Money, inventory and plan tables are out of scope** for this phase. Don't create them.
- **Photos:** private bucket `recipe-photos`; path `<user_id>/<recipe_id>/<uuid>.<ext>`; JPEG, PNG or WebP only; 5 MB maximum; displayed through signed URLs that last 1 hour.
- **URL import:** `http`/`https` only; 10 s timeout; 2 MB maximum; refuses addresses that resolve to private or loopback IPs, re-checking after every redirect (at most 3). Dev-only escape hatch: `IMPORT_ALLOW_PRIVATE=1`, honored only when `NODE_ENV !== "production"`.
- **Recipe limits:**
  - Title: 1–200 characters.
  - Servings: a whole number from 1 to 100.
  - Ingredients: 1–100 lines, each at most 300 characters.
  - Steps: at most 100, each at most 2000 characters.
  - Tags: at most 20, lowercased, each at most 30 characters.
  - Notes: at most 5000 characters.
  - Source URL: http or https, or empty.
- **Sign-in:** email magic link only. Only addresses listed in `ALLOWED_EMAILS` (comma-separated) may request a link.
- **Commits:** end every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Package manager:** use `pnpm`, never npm or yarn.
- **Tests must type-check.** `tsconfig.json` includes `**/*.ts`, so `pnpm build` type-checks the test files too.
- **Deliberate refinements of the spec:**
  - Import tests use hand-written HTML that reproduces the JSON-LD shapes real sites use (plain object, `@graph`, top-level array, `HowToSection`, HTML instruction strings), instead of committing pages copied from recipe sites.
  - `saveRecipe` returns form state only on failure and redirects on success, instead of returning `{ ok: true }`.

## Review Focus

1. **A search containing `%` or `_`** ("100%") must match those characters literally, not as wildcards. Test: Task 9, `filters by title text, treating % and _ literally`.
2. **A `javascript:` or other non-http source URL** must be rejected, because it's rendered as a link. Test: Task 4, `rejects source URLs that are not http(s)`.
3. **A page whose first JSON-LD block is broken** but whose second holds the recipe should still import. Test: Task 5, `skips a broken JSON-LD block and uses the next one`.
4. **A huge paste (101+ ingredient lines)** should produce a field error, not a crash or a partial save. Test: Task 4, `limits ingredients to 100 lines`.
5. **A recipe URL with a non-UUID id, or one owned by another user,** must give a 404, not a 500 or someone else's data. Test: Task 9, `returns null for ids that are not UUIDs` and `never reads, updates or deletes another user's recipe`.

---

## File Structure

```
lib/                          pure, framework-free, unit-tested
  units.ts                    unit aliases, unit kind, labels, quantity formatting
  ingredients.ts              parseIngredient, formatIngredient, normalizeItemName
  sections.ts                 default store section for an item name
  recipe-input.ts             form values ↔ validated RecipeInput (Zod), draft/recipe → form values
  import.ts                   HTML → RecipeDraft (schema.org JSON-LD)
  fetch-page.ts               SSRF-safe page fetcher (DNS, IP checks, redirects, limits)
  photo-rules.ts              photo type and size rules
  safe-next.ts                sanitize ?next= redirect targets
  allowed-email.ts            ALLOWED_EMAILS check
db/
  schema.ts                   Drizzle tables: items, recipes, recipe_ingredients
  index.ts                    Drizzle client (server-only), Db/Tx types
  migrations/                 generated SQL plus one custom migration for RLS, FKs and storage
  queries/items.ts            resolveItems (find or create items for parsed ingredients)
  queries/recipes.ts          list/get/create/update/delete recipes, listTags
server/                       server-only infrastructure
  supabase.ts                 Supabase server client (cookies)
  session.ts                  updateSession for proxy.ts
  auth.ts                     getUser / requireUser
  photos.ts                   upload/remove/sign photo URLs
proxy.ts                      session refresh and sign-in redirect
app/
  layout.tsx                  root layout (metadata, fonts)
  page.tsx                    redirect to /recipes
  login/page.tsx, login/login-form.tsx, login/actions.ts
  auth/confirm/route.ts       magic-link verification
  (app)/layout.tsx            signed-in shell: header, nav, sign out
  (app)/actions.ts            signOut
  (app)/recipes/page.tsx      list, search, tag filter
  (app)/recipes/actions.ts    saveRecipe, deleteRecipeAction, importRecipe
  (app)/recipes/recipe-editor.tsx   client form with import box and ingredient preview
  (app)/recipes/new/page.tsx
  (app)/recipes/[id]/page.tsx, [id]/servings-scaler.tsx, [id]/delete-button.tsx, [id]/not-found.tsx
  (app)/recipes/[id]/edit/page.tsx
  (app)/recipes/error.tsx
components/
  app-nav.tsx                 bottom tabs (mobile) / sidebar (md+)
  ui.ts                       shared Tailwind class strings
supabase/config.toml, supabase/templates/magic-link.html
tests/
  stubs/server-only.ts        empty stub so Vitest can import server modules
  integration/setup.ts, helpers.ts, rls.test.ts, recipes.test.ts
  e2e/helpers.ts, recipes.spec.ts
vitest.config.ts, drizzle.config.ts, playwright.config.ts, .env.example
```

---

### Task 1: Test tooling and the units module

**Files:**
- Create: `vitest.config.ts`, `tests/stubs/server-only.ts`, `lib/units.ts`, `lib/units.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `type UnitKind = "count" | "volume" | "weight"`
  - `matchUnit(tokens: string[]): { unit: string; consumed: number } | null`
  - `unitKind(unit: string): UnitKind`
  - `unitLabel(unit: string, quantity: number): string`
  - `formatQuantity(n: number): string`

- [ ] **Step 1: Install Vitest and add scripts**

Run: `pnpm add -D vitest`

In `package.json`, set `"scripts"` to:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run --project unit",
  "test:watch": "vitest --project unit"
}
```

- [ ] **Step 2: Create the Vitest config and the server-only stub**

`vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("."),
      // `server-only` throws outside the React Server environment; tests import server modules directly.
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["lib/**/*.test.ts"], environment: "node" },
      },
    ],
  },
});
```

`tests/stubs/server-only.ts`:

```ts
export {};
```

- [ ] **Step 3: Write the failing tests**

`lib/units.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatQuantity, matchUnit, unitKind, unitLabel } from "./units";

describe("matchUnit", () => {
  it.each([
    [["cups", "flour"], "cup", 1],
    [["Tablespoons", "butter"], "tbsp", 1],
    [["T", "oil"], "tbsp", 1],
    [["t", "salt"], "tsp", 1],
    [["tsp.", "salt"], "tsp", 1],
    [["fl", "oz", "cream"], "fl oz", 2],
    [["fluid", "ounces", "milk"], "fl oz", 2],
    [["g", "sugar"], "g", 1],
    [["lbs", "beef"], "lb", 1],
    [["cloves", "garlic"], "clove", 1],
    [["cans", "tomatoes"], "can", 1],
  ] as const)("reads %j as %s", (tokens, unit, consumed) => {
    expect(matchUnit([...tokens])).toEqual({ unit, consumed });
  });

  it("returns null when the first token is not a unit", () => {
    expect(matchUnit(["large", "eggs"])).toBeNull();
    expect(matchUnit([])).toBeNull();
  });
});

describe("unitKind", () => {
  it("classifies units", () => {
    expect(unitKind("cup")).toBe("volume");
    expect(unitKind("fl oz")).toBe("volume");
    expect(unitKind("g")).toBe("weight");
    expect(unitKind("lb")).toBe("weight");
    expect(unitKind("clove")).toBe("count");
    expect(unitKind("mystery")).toBe("count");
  });
});

describe("unitLabel", () => {
  it("pluralizes words but not abbreviations", () => {
    expect(unitLabel("cup", 1)).toBe("cup");
    expect(unitLabel("cup", 2)).toBe("cups");
    expect(unitLabel("cup", 0.5)).toBe("cup");
    expect(unitLabel("pinch", 2)).toBe("pinches");
    expect(unitLabel("clove", 3)).toBe("cloves");
    expect(unitLabel("tbsp", 3)).toBe("tbsp");
    expect(unitLabel("fl oz", 2)).toBe("fl oz");
  });
});

describe("formatQuantity", () => {
  it.each([
    [1, "1"],
    [0.5, "½"],
    [1.5, "1 ½"],
    [2 / 3, "⅔"],
    [1 + 1 / 3, "1 ⅓"],
    [2.25, "2 ¼"],
    [0.375, "⅜"],
    [0.99, "1"],
    [0.3, "0.3"],
    [10.1, "10.1"],
    [0.01, "0.01"],
    [0, "0"],
    [(1 + 1 / 3) * 1.5, "2"],
  ])("formats %d as %s", (n, expected) => {
    expect(formatQuantity(n)).toBe(expected);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test lib/units.test.ts`
Expected: FAIL, "Failed to resolve import ./units".

- [ ] **Step 5: Implement `lib/units.ts`**

```ts
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test lib/units.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/stubs/server-only.ts lib/units.ts lib/units.test.ts
git commit -m "Add Vitest and the units module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Ingredient parser

**Files:**
- Create: `lib/ingredients.ts`, `lib/ingredients.test.ts`

**Interfaces:**
- Consumes: `matchUnit`, `formatQuantity`, `unitLabel` from `lib/units.ts`
- Produces:
  - `type ParsedIngredient = { raw: string; quantity: number | null; unit: string | null; name: string | null; note: string | null }`
  - `parseIngredient(raw: string): ParsedIngredient`. `name === null` means "couldn't read this line"; it's kept as raw text.
  - `formatIngredient(p: ParsedIngredient, factor?: number): string`
  - `normalizeItemName(name: string): string`, the item-matching key

- [ ] **Step 1: Write the failing tests**

`lib/ingredients.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatIngredient, normalizeItemName, parseIngredient } from "./ingredients";

describe("parseIngredient", () => {
  it.each([
    ["2 cups flour", { quantity: 2, unit: "cup", name: "flour", note: null }],
    ["1 ½ cups all-purpose flour, sifted", { quantity: 1.5, unit: "cup", name: "all-purpose flour", note: "sifted" }],
    ["1½ cups milk", { quantity: 1.5, unit: "cup", name: "milk", note: null }],
    ["1 1⁄2 cups stock", { quantity: 1.5, unit: "cup", name: "stock", note: null }],
    ["1/2 tsp salt", { quantity: 0.5, unit: "tsp", name: "salt", note: null }],
    ["2-3 cloves garlic, minced", { quantity: 3, unit: "clove", name: "garlic", note: "minced" }],
    ["2 to 3 tbsp olive oil", { quantity: 3, unit: "tbsp", name: "olive oil", note: null }],
    ["200g flour", { quantity: 200, unit: "g", name: "flour", note: null }],
    ["1.5 kg potatoes", { quantity: 1.5, unit: "kg", name: "potatoes", note: null }],
    ["3 eggs", { quantity: 3, unit: null, name: "eggs", note: null }],
    ["2 tomatoes", { quantity: 2, unit: null, name: "tomatoes", note: null }],
    ["2 large eggs, beaten", { quantity: 2, unit: null, name: "eggs", note: "large, beaten" }],
    ["1 (14 oz) can diced tomatoes, drained", { quantity: 1, unit: "can", name: "diced tomatoes", note: "14 oz, drained" }],
    ["a pinch of salt", { quantity: 1, unit: "pinch", name: "salt", note: null }],
    ["1 T olive oil", { quantity: 1, unit: "tbsp", name: "olive oil", note: null }],
    ["Salt to taste", { quantity: null, unit: null, name: "salt", note: "to taste" }],
    ["salt and pepper, to taste", { quantity: null, unit: null, name: "salt and pepper", note: "to taste" }],
    ["8 oz", { quantity: 8, unit: "oz", name: null, note: null }],
    ["For the sauce:", { quantity: null, unit: null, name: null, note: null }],
    ["", { quantity: null, unit: null, name: null, note: null }],
  ])("parses %j", (raw, expected) => {
    expect(parseIngredient(raw)).toMatchObject(expected);
  });

  it("handles unicode thirds", () => {
    expect(parseIngredient("⅓ cup sugar")).toMatchObject({ quantity: expect.closeTo(1 / 3, 5), unit: "cup", name: "sugar" });
  });

  it("normalizes whitespace in raw", () => {
    expect(parseIngredient("  2   cups   water ").raw).toBe("2 cups water");
  });
});

describe("formatIngredient", () => {
  const f = (raw: string, factor: number) => formatIngredient(parseIngredient(raw), factor);

  it("shows the original line at factor 1", () => {
    expect(f("1 ½ cups all-purpose flour, sifted", 1)).toBe("1 ½ cups all-purpose flour, sifted");
  });
  it("scales quantities and pluralizes units", () => {
    expect(f("2 cups flour", 2)).toBe("4 cups flour");
    expect(f("1 cup milk", 0.5)).toBe("½ cup milk");
    expect(f("1 ⅓ cups sugar", 1.5)).toBe("2 cups sugar");
    expect(f("8 oz", 2)).toBe("16 oz");
  });
  it("puts notes in parentheses when scaled", () => {
    expect(f("2 large eggs, beaten", 0.5)).toBe("1 eggs (large, beaten)");
  });
  it("leaves lines without a quantity unchanged", () => {
    expect(f("Salt to taste", 2)).toBe("Salt to taste");
    expect(f("For the sauce:", 2)).toBe("For the sauce:");
  });
});

describe("normalizeItemName", () => {
  it.each([
    ["Eggs", "egg"],
    ["tomatoes", "tomato"],
    ["cherries", "cherry"],
    ["peaches", "peach"],
    ["pies", "pie"],
    ["boxes", "box"],
    ["hummus", "hummus"],
    ["swiss", "swiss"],
    ["  Green   Onions ", "green onion"],
    ["all-purpose flour", "all-purpose flour"],
    ["rice", "rice"],
    ["", ""],
  ])("normalizes %j to %j", (name, key) => {
    expect(normalizeItemName(name)).toBe(key);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/ingredients.test.ts`
Expected: FAIL, "Failed to resolve import ./ingredients".

- [ ] **Step 3: Implement `lib/ingredients.ts`**

```ts
import { formatQuantity, matchUnit, unitLabel } from "./units";

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
    // For a range, buy for the upper bound.
    const value = parseNumber(q[2] ?? q[1]);
    if (Number.isFinite(value) && value > 0) quantity = value;
    rest = rest.slice(q[0].length);
  } else if (/^(a|an)\s/i.test(rest)) {
    quantity = 1;
    rest = rest.replace(/^(a|an)\s+/i, "");
  }

  let unit: string | null = null;
  if (quantity !== null) {
    const tokens = rest.split(" ");
    const match = matchUnit(tokens);
    if (match) {
      unit = match.unit;
      rest = tokens.slice(match.consumed).join(" ");
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

  const name = words.join(" ").toLowerCase() || null;
  const notes = [sizeNote, ...parenNotes, commaNote, ...trailingNotes].filter((n): n is string => Boolean(n));
  return { raw: text, quantity, unit, name, note: notes.length ? notes.join(", ") : null };
}

/** Renders an ingredient scaled by `factor`. At factor 1, or when there is no quantity, shows the original line. */
export function formatIngredient(p: ParsedIngredient, factor = 1): string {
  if (factor === 1 || p.quantity === null) return p.raw;
  const scaled = p.quantity * factor;
  const main = [formatQuantity(scaled), p.unit ? unitLabel(p.unit, scaled) : null, p.name].filter(Boolean).join(" ");
  return p.note ? `${main} (${p.note})` : main;
}

function singularize(word: string): string {
  if (word.length <= 3) return word;
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/ingredients.test.ts`
Expected: PASS. If a single case fails, fix the parser, not the expectation; each expectation is a behavior promised in spec §3.

- [ ] **Step 5: Commit**

```bash
git add lib/ingredients.ts lib/ingredients.test.ts
git commit -m "Add ingredient line parser" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Default store sections

**Files:**
- Create: `lib/sections.ts`, `lib/sections.test.ts`

**Interfaces:**
- Consumes: `normalizeItemName` from `lib/ingredients.ts`
- Produces:
  - `SECTIONS` (readonly ordered tuple)
  - `type Section`
  - `sectionFor(name: string): Section`

- [ ] **Step 1: Write the failing tests**

`lib/sections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sectionFor } from "./sections";

describe("sectionFor", () => {
  it.each([
    ["flour", "pantry"],
    ["all-purpose flour", "pantry"],
    ["green beans", "produce"],
    ["black beans", "pantry"],
    ["chicken broth", "pantry"],
    ["chicken thighs", "meat & seafood"],
    ["frozen peas", "frozen"],
    ["ground cumin", "spices"],
    ["ground beef", "meat & seafood"],
    ["garlic powder", "spices"],
    ["garlic", "produce"],
    ["eggplant", "produce"],
    ["eggs", "dairy & eggs"],
    ["peanut butter", "pantry"],
    ["salted butter", "dairy & eggs"],
    ["red pepper flakes", "spices"],
    ["baguette", "bakery"],
    ["dry white wine", "beverages"],
    ["mystery ingredient", "other"],
  ])("puts %j in %s", (name, section) => {
    expect(sectionFor(name)).toBe(section);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/sections.test.ts`
Expected: FAIL, "Failed to resolve import ./sections".

- [ ] **Step 3: Implement `lib/sections.ts`**

```ts
import { normalizeItemName } from "./ingredients";

export const SECTIONS = [
  "produce",
  "meat & seafood",
  "dairy & eggs",
  "bakery",
  "frozen",
  "pantry",
  "spices",
  "beverages",
  "other",
] as const;
export type Section = (typeof SECTIONS)[number];

// Keywords are in normalized (singular) form. When several keywords match, the one with the most
// words wins ("green bean" over "bean"); on a tie, the section listed first here wins, which is
// why frozen/spices/pantry come before meat and produce ("chicken broth" → pantry).
const KEYWORDS: [Section, string[]][] = [
  ["frozen", ["frozen", "ice cream"]],
  ["spices", [
    "salt", "black pepper", "pepper flake", "peppercorn", "cumin", "paprika", "cinnamon", "nutmeg", "oregano",
    "dried", "chili powder", "garlic powder", "onion powder", "curry powder", "turmeric", "coriander",
    "cardamom", "allspice", "bay leaf", "cayenne", "vanilla", "vanilla extract", "spice", "seasoning",
  ]],
  ["pantry", [
    "flour", "sugar", "rice", "pasta", "spaghetti", "noodle", "oat", "bread crumb", "breadcrumb", "panko",
    "broth", "stock", "oil", "vinegar", "soy sauce", "sauce", "ketchup", "mustard", "mayonnaise", "honey",
    "syrup", "baking soda", "baking powder", "yeast", "cornstarch", "bean", "lentil", "chickpea", "canned",
    "tomato paste", "coconut milk", "peanut butter", "nut", "almond", "walnut", "pecan", "raisin",
    "chocolate", "cocoa", "jam", "cracker", "cereal", "quinoa", "couscous",
  ]],
  ["meat & seafood", [
    "chicken", "beef", "pork", "bacon", "sausage", "ham", "turkey", "lamb", "steak", "ground", "salmon",
    "tuna", "shrimp", "fish", "cod", "prosciutto", "chorizo", "anchovy",
  ]],
  ["dairy & eggs", [
    "milk", "butter", "cheese", "cream", "yogurt", "egg", "parmesan", "mozzarella", "cheddar", "feta",
    "ricotta", "sour cream", "half-and-half", "buttermilk",
  ]],
  ["bakery", ["bread", "bun", "roll", "tortilla", "pita", "bagel", "baguette", "naan", "croissant"]],
  ["produce", [
    "onion", "garlic", "tomato", "potato", "sweet potato", "carrot", "celery", "lettuce", "spinach", "kale",
    "pepper", "bell pepper", "jalapeno", "cucumber", "zucchini", "squash", "mushroom", "broccoli",
    "cauliflower", "cabbage", "lemon", "lime", "orange", "apple", "banana", "berry", "strawberry",
    "blueberry", "avocado", "ginger", "cilantro", "parsley", "basil", "mint", "thyme", "rosemary",
    "scallion", "green onion", "shallot", "leek", "corn", "pea", "eggplant", "herb", "grape", "peach",
    "pear", "mango", "pineapple", "asparagus", "green bean", "arugula",
  ]],
  ["beverages", ["wine", "beer", "juice", "coffee", "tea", "soda", "sparkling water"]],
];

export function sectionFor(name: string): Section {
  const padded = ` ${normalizeItemName(name)} `;
  let best: { section: Section; words: number } | null = null;
  for (const [section, keywords] of KEYWORDS) {
    for (const keyword of keywords) {
      if (!padded.includes(` ${keyword} `)) continue;
      const words = keyword.split(" ").length;
      if (!best || words > best.words) best = { section, words };
    }
  }
  return best?.section ?? "other";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sections.ts lib/sections.test.ts
git commit -m "Add default store sections for items" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recipe form validation and photo rules

**Files:**
- Create: `lib/recipe-input.ts`, `lib/recipe-input.test.ts`, `lib/photo-rules.ts`, `lib/photo-rules.test.ts`

**Interfaces:**
- Consumes: the `RecipeDraft` type from `lib/import.ts` (Task 5). To keep this task independent, `draftToFormValues` accepts a structural type with the same fields.
- Produces:
  - `type RecipeFormValues = { title: string; servings: string; ingredients: string; steps: string; tags: string; sourceUrl: string; notes: string }`
  - `type RecipeInput = { title: string; servings: number; ingredients: string[]; steps: string[]; tags: string[]; sourceUrl: string | null; notes: string | null }`
  - `type FieldErrors = Partial<Record<keyof RecipeFormValues | "photo", string>>`
  - `EMPTY_RECIPE_FORM: RecipeFormValues`
  - `readRecipeForm(fd: FormData): RecipeFormValues`
  - `validateRecipe(values: RecipeFormValues): { ok: true; data: RecipeInput } | { ok: false; fieldErrors: FieldErrors }`
  - `draftToFormValues(d: { title: string; servings: number | null; ingredients: string[]; steps: string[]; tags: string[]; sourceUrl: string }): RecipeFormValues`
  - `recipeToFormValues(r: { title: string; servings: number; ingredients: { rawText: string }[]; steps: string[]; tags: string[]; sourceUrl: string | null; notes: string | null }): RecipeFormValues`
  - `PHOTO_MAX_BYTES`, `PHOTO_TYPES: Record<string, string>` (MIME type → extension), `checkPhoto(file: { size: number; type: string } | null): { ok: true } | { ok: false; message: string }`

- [ ] **Step 1: Install Zod**

Run: `pnpm add zod`

- [ ] **Step 2: Write the failing tests**

`lib/recipe-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_RECIPE_FORM,
  draftToFormValues,
  readRecipeForm,
  recipeToFormValues,
  validateRecipe,
  type RecipeFormValues,
} from "./recipe-input";

const valid: RecipeFormValues = {
  title: "  Pancakes ",
  servings: "4",
  ingredients: "2 cups flour\n\n  1 cup milk  \r\n",
  steps: "Whisk.\nCook.\n",
  tags: "Breakfast, sweet, breakfast, ",
  sourceUrl: "",
  notes: "  ",
};
const withValues = (overrides: Partial<RecipeFormValues>) => validateRecipe({ ...valid, ...overrides });

describe("validateRecipe", () => {
  it("normalizes a valid form", () => {
    expect(validateRecipe(valid)).toEqual({
      ok: true,
      data: {
        title: "Pancakes",
        servings: 4,
        ingredients: ["2 cups flour", "1 cup milk"],
        steps: ["Whisk.", "Cook."],
        tags: ["breakfast", "sweet"],
        sourceUrl: null,
        notes: null,
      },
    });
  });

  it.each([
    [{ title: "   " }, "title", "Title is required"],
    [{ title: "x".repeat(201) }, "title", "Keep the title under 200 characters"],
    [{ servings: "" }, "servings", "Servings is required"],
    [{ servings: "abc" }, "servings", "Servings must be a number"],
    [{ servings: "2.5" }, "servings", "Servings must be a whole number"],
    [{ servings: "0" }, "servings", "At least 1 serving"],
    [{ servings: "101" }, "servings", "At most 100 servings"],
    [{ ingredients: " \n " }, "ingredients", "Add at least one ingredient"],
    [{ ingredients: "x".repeat(301) }, "ingredients", "Keep each ingredient under 300 characters"],
    [{ tags: "x".repeat(31) }, "tags", "Keep each tag under 30 characters"],
    [{ notes: "x".repeat(5001) }, "notes", "Keep notes under 5000 characters"],
  ] as const)("rejects %j", (overrides, field, message) => {
    expect(withValues(overrides)).toEqual({ ok: false, fieldErrors: { [field]: message } });
  });

  it("limits ingredients to 100 lines", () => {
    const lines = Array.from({ length: 101 }, (_, i) => `${i + 1} eggs`).join("\n");
    expect(withValues({ ingredients: lines })).toEqual({ ok: false, fieldErrors: { ingredients: "At most 100 ingredients" } });
  });

  it("rejects source URLs that are not http(s)", () => {
    for (const sourceUrl of ["javascript:alert(1)", "example.com", "ftp://example.com/x"]) {
      expect(withValues({ sourceUrl })).toEqual({ ok: false, fieldErrors: { sourceUrl: "Enter a full http(s) URL" } });
    }
    expect(withValues({ sourceUrl: "https://example.com/r" })).toMatchObject({ ok: true, data: { sourceUrl: "https://example.com/r" } });
  });

  it("reports several fields at once", () => {
    const result = withValues({ title: "", servings: "0" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["servings", "title"]);
  });
});

describe("readRecipeForm", () => {
  it("reads every field as a string, defaulting to empty", () => {
    const fd = new FormData();
    fd.set("title", "Soup");
    expect(readRecipeForm(fd)).toEqual({ ...EMPTY_RECIPE_FORM, title: "Soup" });
  });
});

describe("form value converters", () => {
  it("turns an import draft into form values", () => {
    expect(
      draftToFormValues({ title: "Soup", servings: null, ingredients: ["1 onion", "2 cups stock"], steps: ["Chop.", "Simmer."], tags: ["dinner", "soup"], sourceUrl: "https://example.com/soup" }),
    ).toEqual({ title: "Soup", servings: "", ingredients: "1 onion\n2 cups stock", steps: "Chop.\nSimmer.", tags: "dinner, soup", sourceUrl: "https://example.com/soup", notes: "" });
  });

  it("turns a saved recipe into form values that validate back to the same recipe", () => {
    const values = recipeToFormValues({ title: "Soup", servings: 2, ingredients: [{ rawText: "1 onion" }], steps: ["Chop."], tags: ["soup"], sourceUrl: null, notes: "Freezes well" });
    expect(values).toEqual({ title: "Soup", servings: "2", ingredients: "1 onion", steps: "Chop.", tags: "soup", sourceUrl: "", notes: "Freezes well" });
    expect(validateRecipe(values)).toEqual({
      ok: true,
      data: { title: "Soup", servings: 2, ingredients: ["1 onion"], steps: ["Chop."], tags: ["soup"], sourceUrl: null, notes: "Freezes well" },
    });
  });
});
```

`lib/photo-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES, checkPhoto } from "./photo-rules";

describe("checkPhoto", () => {
  it("accepts no photo", () => expect(checkPhoto(null)).toEqual({ ok: true }));
  it("accepts JPEG, PNG and WebP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkPhoto({ type, size: PHOTO_MAX_BYTES })).toEqual({ ok: true });
    }
  });
  it("rejects other types, including object prototype keys", () => {
    for (const type of ["image/gif", "application/pdf", "constructor", ""]) {
      expect(checkPhoto({ type, size: 10 })).toEqual({ ok: false, message: "Use a JPEG, PNG or WebP image." });
    }
  });
  it("rejects files over 5 MB", () => {
    expect(checkPhoto({ type: "image/png", size: PHOTO_MAX_BYTES + 1 })).toEqual({ ok: false, message: "Photos must be 5 MB or smaller." });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test lib/recipe-input.test.ts lib/photo-rules.test.ts`
Expected: FAIL, the modules can't be resolved.

- [ ] **Step 4: Implement `lib/recipe-input.ts`**

```ts
import { z } from "zod";

export type RecipeFormValues = {
  title: string;
  servings: string;
  ingredients: string;
  steps: string;
  tags: string;
  sourceUrl: string;
  notes: string;
};

export type RecipeInput = {
  title: string;
  servings: number;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl: string | null;
  notes: string | null;
};

export type FieldErrors = Partial<Record<keyof RecipeFormValues | "photo", string>>;

export const EMPTY_RECIPE_FORM: RecipeFormValues = {
  title: "",
  servings: "",
  ingredients: "",
  steps: "",
  tags: "",
  sourceUrl: "",
  notes: "",
};

const toLines = (s: string) => s.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const toTags = (s: string) => [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

const recipeSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Keep the title under 200 characters"),
  servings: z
    .string()
    .trim()
    .min(1, "Servings is required")
    .pipe(
      z.coerce
        .number({ error: "Servings must be a number" })
        .int("Servings must be a whole number")
        .min(1, "At least 1 serving")
        .max(100, "At most 100 servings"),
    ),
  ingredients: z
    .string()
    .transform(toLines)
    .pipe(
      z
        .array(z.string().max(300, "Keep each ingredient under 300 characters"))
        .min(1, "Add at least one ingredient")
        .max(100, "At most 100 ingredients"),
    ),
  steps: z
    .string()
    .transform(toLines)
    .pipe(z.array(z.string().max(2000, "Keep each step under 2000 characters")).max(100, "At most 100 steps")),
  tags: z
    .string()
    .transform(toTags)
    .pipe(z.array(z.string().max(30, "Keep each tag under 30 characters")).max(20, "At most 20 tags")),
  sourceUrl: z
    .string()
    .trim()
    .transform((s) => s || null)
    .pipe(z.url({ protocol: /^https?$/, error: "Enter a full http(s) URL" }).nullable()),
  notes: z
    .string()
    .trim()
    .max(5000, "Keep notes under 5000 characters")
    .transform((s) => s || null),
});

export function readRecipeForm(fd: FormData): RecipeFormValues {
  const read = (key: keyof RecipeFormValues) => {
    const value = fd.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    title: read("title"),
    servings: read("servings"),
    ingredients: read("ingredients"),
    steps: read("steps"),
    tags: read("tags"),
    sourceUrl: read("sourceUrl"),
    notes: read("notes"),
  };
}

export function validateRecipe(
  values: RecipeFormValues,
): { ok: true; data: RecipeInput } | { ok: false; fieldErrors: FieldErrors } {
  const result = recipeSchema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const flat = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors: FieldErrors = {};
  for (const [field, messages] of Object.entries(flat)) {
    if (messages?.[0]) fieldErrors[field as keyof FieldErrors] = messages[0];
  }
  return { ok: false, fieldErrors };
}

export function draftToFormValues(d: {
  title: string;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl: string;
}): RecipeFormValues {
  return {
    title: d.title,
    servings: d.servings === null ? "" : String(d.servings),
    ingredients: d.ingredients.join("\n"),
    steps: d.steps.join("\n"),
    tags: d.tags.join(", "),
    sourceUrl: d.sourceUrl,
    notes: "",
  };
}

export function recipeToFormValues(r: {
  title: string;
  servings: number;
  ingredients: { rawText: string }[];
  steps: string[];
  tags: string[];
  sourceUrl: string | null;
  notes: string | null;
}): RecipeFormValues {
  return {
    title: r.title,
    servings: String(r.servings),
    ingredients: r.ingredients.map((i) => i.rawText).join("\n"),
    steps: r.steps.join("\n"),
    tags: r.tags.join(", "),
    sourceUrl: r.sourceUrl ?? "",
    notes: r.notes ?? "",
  };
}
```

- [ ] **Step 5: Implement `lib/photo-rules.ts`**

```ts
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types and the file extension used when storing them. */
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function checkPhoto(file: { size: number; type: string } | null): { ok: true } | { ok: false; message: string } {
  if (!file) return { ok: true };
  if (!Object.hasOwn(PHOTO_TYPES, file.type)) return { ok: false, message: "Use a JPEG, PNG or WebP image." };
  if (file.size > PHOTO_MAX_BYTES) return { ok: false, message: "Photos must be 5 MB or smaller." };
  return { ok: true };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test lib/recipe-input.test.ts lib/photo-rules.test.ts`
Expected: PASS. If the `servings: "abc"` case reports a different message, check Zod 4's `z.coerce.number({ error })` behavior for NaN and adjust the schema (not the test) so the message is `Servings must be a number`.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/recipe-input.ts lib/recipe-input.test.ts lib/photo-rules.ts lib/photo-rules.test.ts
git commit -m "Add recipe form validation and photo rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Recipe extraction from HTML (JSON-LD)

**Files:**
- Create: `lib/import.ts`, `lib/import.test.ts`

**Interfaces:**
- Produces:
  - `type RecipeDraft = { title: string; servings: number | null; ingredients: string[]; steps: string[]; tags: string[]; sourceUrl: string }`
  - `extractRecipe(html: string, sourceUrl: string): RecipeDraft | null`, which returns null when the page has no `Recipe` node
  - `extractTitle(html: string): string | null`

- [ ] **Step 1: Write the failing tests**

`lib/import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractRecipe, extractTitle } from "./import";

const URL_ = "https://example.com/r";
const script = (body: string) => `<script type="application/ld+json">${body}</script>`;
const page = (...scripts: string[]) => `<html><head><title>Site Title</title>${scripts.join("")}</head><body></body></html>`;

describe("extractRecipe", () => {
  it("reads a plain Recipe object", () => {
    const html = page(
      script(
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Recipe",
          name: "Weeknight Pasta",
          recipeYield: "4 servings",
          recipeIngredient: ["1 lb spaghetti", "&frac12; cup parmesan", "Chef&#39;s salt"],
          recipeInstructions: [
            { "@type": "HowToStep", text: "Boil water." },
            { "@type": "HowToStep", text: "Cook pasta &amp; drain." },
          ],
          keywords: "Weeknight, pasta, weeknight",
        }),
      ),
    );
    expect(extractRecipe(html, URL_)).toEqual({
      title: "Weeknight Pasta",
      servings: 4,
      ingredients: ["1 lb spaghetti", "½ cup parmesan", "Chef's salt"],
      steps: ["Boil water.", "Cook pasta & drain."],
      tags: ["weeknight", "pasta"],
      sourceUrl: URL_,
    });
  });

  it("finds a Recipe inside @graph with an array @type and sectioned steps", () => {
    const html = page(
      script(
        JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebPage", name: "Page" },
            {
              "@type": ["Recipe", "NewsArticle"],
              name: "Chili",
              recipeYield: ["6", "6 servings"],
              recipeIngredient: ["1 onion"],
              recipeInstructions: [
                { "@type": "HowToSection", name: "Base", itemListElement: [{ "@type": "HowToStep", text: "Chop onion." }] },
                { "@type": "HowToSection", name: "Finish", itemListElement: [{ "@type": "HowToStep", text: "Simmer." }] },
              ],
              keywords: ["Dinner", "Spicy"],
            },
          ],
        }),
      ),
    );
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Chili", servings: 6, steps: ["Chop onion.", "Simmer."], tags: ["dinner", "spicy"] });
  });

  it("reads a top-level array and splits an HTML instruction string", () => {
    const html = page(
      script(
        JSON.stringify([
          { "@type": "Organization", name: "Blog" },
          { "@type": "Recipe", name: "Cookies", recipeYield: 12, recipeIngredient: ["2 cups flour"], recipeInstructions: "<p>Mix.</p><p>Bake 30 min.</p>" },
        ]),
      ),
    );
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Cookies", servings: 12, steps: ["Mix.", "Bake 30 min."] });
  });

  it("skips a broken JSON-LD block and uses the next one", () => {
    const html = page(script("{ not json"), script(JSON.stringify({ "@type": "Recipe", name: "Soup", recipeIngredient: ["1 onion"] })));
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Soup", ingredients: ["1 onion"] });
  });

  it("tolerates raw newlines inside JSON strings", () => {
    const html = page(script(`{"@type":"Recipe","name":"Line\nBreak","recipeIngredient":["1 egg"]}`));
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Line Break" });
  });

  it("falls back to the page title and handles missing or unusable yields", () => {
    const noYield = page(script(JSON.stringify({ "@type": "Recipe", recipeIngredient: ["1 egg"] })));
    expect(extractRecipe(noYield, URL_)).toMatchObject({ title: "Site Title", servings: null, steps: [], tags: [] });

    const cookies = page(script(JSON.stringify({ "@type": "Recipe", name: "C", recipeYield: "Makes about 24 cookies" })));
    expect(extractRecipe(cookies, URL_)?.servings).toBe(24);

    const huge = page(script(JSON.stringify({ "@type": "Recipe", name: "C", recipeYield: "Serves 200" })));
    expect(extractRecipe(huge, URL_)?.servings).toBeNull();
  });

  it("returns null when there is no Recipe", () => {
    expect(extractRecipe(page(script(JSON.stringify({ "@type": "WebPage" }))), URL_)).toBeNull();
    expect(extractRecipe("<html><body>hi</body></html>", URL_)).toBeNull();
  });
});

describe("extractTitle", () => {
  it("decodes the <title>", () => {
    expect(extractTitle("<title>Grandma&#39;s  Page</title>")).toBe("Grandma's Page");
    expect(extractTitle("<html></html>")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/import.test.ts`
Expected: FAIL, "Failed to resolve import ./import".

- [ ] **Step 3: Implement `lib/import.ts`**

```ts
export type RecipeDraft = {
  title: string;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl: string;
};

type Node = Record<string, unknown>;

const LD_JSON = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

export function extractRecipe(html: string, sourceUrl: string): RecipeDraft | null {
  for (const match of html.matchAll(LD_JSON)) {
    const recipe = findRecipe(parseJson(match[1]));
    if (recipe) return toDraft(recipe, html, sourceUrl);
  }
  return null;
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return (match && clean(match[1])) || null;
}

function parseJson(text: string): unknown {
  const body = text.trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
  try {
    return JSON.parse(body);
  } catch {
    // Some sites emit raw control characters inside strings; retry with them flattened to spaces.
  }
  try {
    return JSON.parse(body.replace(/[\u0000-\u001f]+/g, " "));
  } catch {
    return undefined;
  }
}

function isRecipe(node: Node): boolean {
  const type = node["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

function findRecipe(data: unknown, depth = 0): Node | null {
  if (depth > 5 || data === null || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findRecipe(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const node = data as Node;
  if (isRecipe(node)) return node;
  return findRecipe(node["@graph"], depth + 1) ?? findRecipe(node.mainEntity, depth + 1);
}

function toDraft(node: Node, html: string, sourceUrl: string): RecipeDraft {
  return {
    title: text(node.name) || extractTitle(html) || "",
    servings: toServings(node.recipeYield),
    ingredients: asArray(node.recipeIngredient ?? node.ingredients).map(text).filter(Boolean),
    steps: toSteps(node.recipeInstructions),
    tags: toTags(node.keywords),
    sourceUrl,
  };
}

function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  return typeof value === "string" ? clean(value) : "";
}

function toServings(value: unknown): number | null {
  for (const entry of asArray(value)) {
    const n =
      typeof entry === "number" ? Math.round(entry)
      : typeof entry === "string" ? parseInt(/\d+/.exec(entry)?.[0] ?? "", 10)
      : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 100) return n;
  }
  return null;
}

function toSteps(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/\r?\n|<\/p>|<br\s*\/?>|<\/li>/i).map(clean).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(toSteps);
  if (value && typeof value === "object") {
    const node = value as Node;
    if (node.itemListElement) return toSteps(node.itemListElement);
    if (typeof node.text === "string") return toSteps(node.text);
    const name = text(node.name);
    return name ? [name] : [];
  }
  return [];
}

function toTags(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(",") : asArray(value).filter((t): t is string => typeof t === "string");
  return [...new Set(raw.map((t) => clean(t).toLowerCase()).filter(Boolean))].slice(0, 20);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾",
  deg: "°", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(s: string): string {
  const stripTags = (t: string) => t.replace(/<[^>]*>/g, " ");
  return stripTags(decodeEntities(stripTags(s))).replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/import.ts lib/import.test.ts
git commit -m "Extract recipes from schema.org JSON-LD" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: SSRF-safe page fetcher

**Files:**
- Create: `lib/fetch-page.ts`, `lib/fetch-page.test.ts`

**Interfaces:**
- Produces:
  - `class FetchPageError extends Error { reason: "invalid-url" | "blocked" | "network" | "http" | "not-html" | "timeout" | "too-large" }`. `message` is user-facing.
  - `isPrivateAddress(ip: string): boolean`
  - `type FetchPageOptions = { lookup?: (host: string) => Promise<string[]>; fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number; maxRedirects?: number; allowPrivate?: boolean }`
  - `fetchPage(url: string, options?: FetchPageOptions): Promise<{ url: string; html: string }>`

This module uses `node:dns` and `node:net`, but it has no Next.js or database imports and its effects can be injected, so it lives in `lib/` with unit tests.

- [ ] **Step 1: Write the failing tests**

`lib/fetch-page.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { FetchPageError, fetchPage, isPrivateAddress } from "./fetch-page";

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true], ["10.1.2.3", true], ["172.16.0.1", true], ["172.31.255.255", true], ["172.32.0.1", false],
    ["192.168.1.1", true], ["169.254.169.254", true], ["100.64.0.1", true], ["0.0.0.0", true], ["224.0.0.1", true],
    ["8.8.8.8", false], ["93.184.216.34", false],
    ["::1", true], ["::", true], ["fd00::1", true], ["fe80::1", true], ["ff02::1", true],
    ["::ffff:127.0.0.1", true], ["::ffff:7f00:1", true], ["::ffff:8.8.8.8", false], ["2606:4700::1111", false],
    ["not-an-ip", true],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

const html = (body = "<html>ok</html>", init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const publicLookup = async () => ["93.184.216.34"];

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof FetchPageError) return e.reason;
    throw e;
  }
  throw new Error("expected fetchPage to fail");
}

describe("fetchPage", () => {
  it("returns the HTML and final URL for a public page", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => html("<p>hi</p>"));
    await expect(fetchPage("https://example.com/r", { lookup: publicLookup, fetchImpl })).resolves.toEqual({ url: "https://example.com/r", html: "<p>hi</p>" });
    const [input, init] = fetchImpl.mock.calls[0];
    expect(String(input)).toBe("https://example.com/r");
    expect(init).toMatchObject({ redirect: "manual" });
  });

  it("rejects malformed and non-http URLs", async () => {
    expect(await reasonOf(fetchPage("not a url"))).toBe("invalid-url");
    expect(await reasonOf(fetchPage("ftp://example.com/x"))).toBe("invalid-url");
    expect(await reasonOf(fetchPage("javascript:alert(1)"))).toBe("invalid-url");
  });

  it("blocks hosts that resolve to private addresses without fetching", async () => {
    const fetchImpl = vi.fn();
    expect(await reasonOf(fetchPage("https://intranet.example/", { lookup: async () => ["10.0.0.5"], fetchImpl }))).toBe("blocked");
    expect(await reasonOf(fetchPage("https://mixed.example/", { lookup: async () => ["93.184.216.34", "127.0.0.1"], fetchImpl }))).toBe("blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks literal private IPs, including IPv6 in brackets", async () => {
    const lookup = vi.fn();
    expect(await reasonOf(fetchPage("http://127.0.0.1:3000/", { lookup }))).toBe("blocked");
    expect(await reasonOf(fetchPage("http://[::1]/", { lookup }))).toBe("blocked");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("re-checks every redirect target", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://internal.example/admin" } }));
    const lookup = async (host: string) => (host === "internal.example" ? ["192.168.0.2"] : ["93.184.216.34"]);
    expect(await reasonOf(fetchPage("https://example.com/", { lookup, fetchImpl }))).toBe("blocked");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows relative redirects and reports the final URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/recipes/soup" } }))
      .mockResolvedValueOnce(html());
    await expect(fetchPage("https://example.com/s", { lookup: publicLookup, fetchImpl })).resolves.toMatchObject({ url: "https://example.com/recipes/soup" });
  });

  it("stops after too many redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl, maxRedirects: 3 }))).toBe("http");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("enforces the size limit", async () => {
    const fetchImpl = async () => html("x".repeat(11));
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl, maxBytes: 10 }))).toBe("too-large");
  });

  it("rejects error statuses and non-HTML responses", async () => {
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: async () => html("", { status: 404 }) }))).toBe("http");
    const pdf = async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: pdf }))).toBe("not-html");
  });

  it("maps timeouts and network failures", async () => {
    const timeout = async () => { throw new DOMException("slow", "TimeoutError"); };
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: timeout }))).toBe("timeout");
    const offline = async () => { throw new TypeError("fetch failed"); };
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: offline }))).toBe("network");
    const noDns = async () => { throw new Error("ENOTFOUND"); };
    expect(await reasonOf(fetchPage("https://nope.example/", { lookup: noDns }))).toBe("network");
  });

  it("allows private addresses only when asked", async () => {
    await expect(fetchPage("http://127.0.0.1:4000/", { allowPrivate: true, fetchImpl: async () => html() })).resolves.toMatchObject({ html: "<html>ok</html>" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/fetch-page.test.ts`
Expected: FAIL, "Failed to resolve import ./fetch-page".

- [ ] **Step 3: Implement `lib/fetch-page.ts`**

```ts
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type FetchPageReason = "invalid-url" | "blocked" | "network" | "http" | "not-html" | "timeout" | "too-large";

export class FetchPageError extends Error {
  constructor(
    public readonly reason: FetchPageReason,
    message: string,
  ) {
    super(message);
    this.name = "FetchPageError";
  }
}

export type FetchPageOptions = {
  lookup?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowPrivate?: boolean;
};

const defaultLookup = async (host: string) => (await dnsLookup(host, { all: true })).map((a) => a.address);

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip.toLowerCase());
  return true;
}

function isPrivateV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateV6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true;
  const mapped = /^::ffff:(.+)$/.exec(ip);
  if (mapped) {
    const rest = mapped[1];
    if (isIP(rest) === 4) return isPrivateV4(rest);
    const [hi, lo] = rest.split(":").map((h) => parseInt(h, 16));
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return true;
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

async function assertPublicHost(hostname: string, lookup: (host: string) => Promise<string[]>): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new FetchPageError("network", "Couldn't reach that website.");
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new FetchPageError("blocked", "That address can't be imported.");
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FetchPageError("too-large", "That page is too large to import.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof FetchPageError) throw error;
    if (isTimeout(error)) throw new FetchPageError("timeout", "That page took too long to load.");
    throw new FetchPageError("network", "Couldn't download that page.");
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Fetches an HTML page for import, refusing private/loopback destinations (checked again after
 * every redirect). Residual risk: DNS can change between our lookup and fetch's own lookup.
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<{ url: string; html: string }> {
  const {
    lookup = defaultLookup,
    fetchImpl = fetch,
    timeoutMs = 10_000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 3,
    allowPrivate = false,
  } = options;

  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new FetchPageError("invalid-url", "Enter a full web address starting with http:// or https://.");
  }
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new FetchPageError("invalid-url", "Enter a full web address starting with http:// or https://.");
    }
    if (!allowPrivate) await assertPublicHost(current.hostname, lookup);

    let response: Response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        signal,
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": "FoodiniRecipeImporter/1.0" },
      });
    } catch (error) {
      if (isTimeout(error)) throw new FetchPageError("timeout", "That page took too long to load.");
      throw new FetchPageError("network", "Couldn't reach that website.");
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new FetchPageError("http", `That page returned an error (${response.status}).`);
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) throw new FetchPageError("not-html", "That link isn't a web page.");
    return { url: current.toString(), html: await readLimited(response, maxBytes) };
  }
  throw new FetchPageError("http", "That page redirected too many times.");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/fetch-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fetch-page.ts lib/fetch-page.test.ts
git commit -m "Add SSRF-safe page fetcher for recipe import" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Local Supabase, the Drizzle schema, migrations and row-level security

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/templates/magic-link.html`, `.env.example`, `drizzle.config.ts`, `db/schema.ts`, `db/index.ts`, `db/migrations/*` (generated plus one custom file), `tests/integration/setup.ts`, `tests/integration/helpers.ts`, `tests/integration/rls.test.ts`
- Modify: `package.json` (scripts), `pnpm-workspace.yaml`, `.gitignore`, `vitest.config.ts`

**Interfaces:**
- Produces:
  - Drizzle tables `items`, `recipes`, `recipeIngredients` and the enum `unitKindEnum` from `@/db/schema`
  - `db`, `sqlClient`, `type Db`, `type Tx`, `type DbOrTx` from `@/db`
  - Test helpers `createTestUser(): Promise<TestUser>`, `deleteTestUser(id: string): Promise<void>`, `signedInClient(user: TestUser): Promise<SupabaseClient>`, `type TestUser = { id: string; email: string; password: string }` from `tests/integration/helpers.ts`

**Prerequisite:** Docker Desktop is running (`docker info` succeeds).

- [ ] **Step 1: Install dependencies and allow the Supabase CLI build script**

Add to `pnpm-workspace.yaml` under `allowBuilds:` (the Supabase npm package downloads its binary in a postinstall script):

```yaml
allowBuilds:
  sharp: false
  unrs-resolver: false
  supabase: true
```

Run:

```bash
pnpm add drizzle-orm postgres server-only @supabase/supabase-js @supabase/ssr
pnpm add -D drizzle-kit supabase
```

If pnpm reports an ignored build script for `esbuild`, add `esbuild: true` under `allowBuilds` and run `pnpm install` again.

- [ ] **Step 2: Initialize and configure local Supabase**

Run: `pnpm exec supabase init` (answer "N" to the editor-settings prompts).

In `supabase/config.toml`, in the `[auth]` section, set:

```toml
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**", "http://127.0.0.1:3000/**", "http://localhost:3100/**"]
```

Append to `supabase/config.toml`:

```toml
[auth.email.template.magic_link]
subject = "Your Foodini sign-in link"
content_path = "./supabase/templates/magic-link.html"

# First sign-in for a new address sends the "confirmation" email; use the same link format.
[auth.email.template.confirmation]
subject = "Your Foodini sign-in link"
content_path = "./supabase/templates/magic-link.html"
```

Create `supabase/templates/magic-link.html`. `{{ .RedirectTo }}` is the `emailRedirectTo` passed by the app, which already contains `?next=…`:

```html
<h2>Sign in to Foodini</h2>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
<p>If you didn't ask for this, you can ignore this email.</p>
```

Run: `pnpm exec supabase start`
Expected: the command prints the API URL (`http://127.0.0.1:54321`), the DB URL (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), Mailpit (`http://127.0.0.1:54324`), and the publishable and secret keys. `pnpm exec supabase status` prints them again at any time.

- [ ] **Step 3: Environment files**

In `.gitignore`, directly under the existing `.env*` line, add:

```
!.env.example
```

Create `.env.example`:

```bash
# Local values come from `pnpm exec supabase status`.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Server-side only. Used by integration and e2e tests to create test users.
# Use the "Secret key" from `supabase status` (older CLIs call it the service_role key).
SUPABASE_SECRET_KEY=
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SITE_URL=http://localhost:3000
# Comma-separated emails allowed to sign in.
ALLOWED_EMAILS=you@example.com
```

Copy it to `.env.local` and fill in the two keys from `pnpm exec supabase status`, plus your own email in `ALLOWED_EMAILS`. `.env.local` is gitignored.

- [ ] **Step 4: Write the Drizzle schema and client**

`db/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// user_id columns reference auth.users; the foreign keys live in the custom RLS migration
// because drizzle-kit only manages the public schema.

export const unitKindEnum = pgEnum("unit_kind", ["count", "volume", "weight"]);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    /** normalizeItemName(name): the per-user matching key. */
    key: text("key").notNull(),
    section: text("section").notNull(),
    unitKind: unitKindEnum("unit_kind").notNull(),
  },
  (t) => [uniqueIndex("items_user_key_idx").on(t.userId, t.key)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    servings: integer("servings").notNull(),
    steps: text("steps").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    sourceUrl: text("source_url"),
    imagePath: text("image_path"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recipes_user_updated_idx").on(t.userId, t.updatedAt),
    check("recipes_servings_positive", sql`${t.servings} > 0`),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    rawText: text("raw_text").notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    quantity: numeric("quantity", { mode: "number" }),
    unit: text("unit"),
    note: text("note"),
  },
  (t) => [index("recipe_ingredients_recipe_idx").on(t.recipeId, t.position)],
);
```

`db/index.ts`:

```ts
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

// Reuse one connection pool across dev hot reloads.
const globalForDb = globalThis as unknown as { foodiniSql?: ReturnType<typeof postgres> };
// prepare: false keeps this compatible with Supabase's transaction pooler in production.
export const sqlClient = globalForDb.foodiniSql ?? postgres(url, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.foodiniSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI): rely on the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Add these to the `package.json` scripts:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"test:int": "vitest run --project integration"
```

- [ ] **Step 5: Generate the table migration and write the RLS migration**

Run: `pnpm db:generate --name=init`
Expected: `db/migrations/0000_init.sql` containing `CREATE TYPE "public"."unit_kind"`, three `CREATE TABLE` statements, the unique index and the check constraint.

Run: `pnpm exec drizzle-kit generate --custom --name=rls_and_storage`
Expected: an empty `db/migrations/0001_rls_and_storage.sql`. Replace its contents with:

```sql
-- Owner foreign keys to Supabase Auth users; deleting a user deletes their data.
ALTER TABLE "items" ADD CONSTRAINT "items_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_user_fk" FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Data API access: signed-in users only, and only their own rows.
REVOKE ALL ON "items", "recipes", "recipe_ingredients" FROM anon;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "items", "recipes", "recipe_ingredients" TO authenticated;
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "items_owner" ON "items" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY "recipes_owner" ON "recipes" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint
CREATE POLICY "recipe_ingredients_owner" ON "recipe_ingredients" FOR ALL TO authenticated
  USING ("user_id" = (select auth.uid())) WITH CHECK ("user_id" = (select auth.uid()));
--> statement-breakpoint

-- Private photo bucket; objects live under "<user_id>/…".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recipe-photos', 'recipe-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE POLICY "recipe_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
CREATE POLICY "recipe_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
CREATE POLICY "recipe_photos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text)
  WITH CHECK (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
--> statement-breakpoint
CREATE POLICY "recipe_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recipe-photos' AND (storage.foldername(name))[1] = (select auth.uid())::text);
```

Run: `pnpm db:migrate`
Expected: both migrations apply without errors. Note: `pnpm exec supabase db reset` wipes this schema, so run `pnpm db:migrate` again after any reset.

- [ ] **Step 6: Add the integration test project, setup and helpers**

In `vitest.config.ts`, add a second entry to `test.projects`:

```ts
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
```

`tests/integration/setup.ts`:

```ts
try {
  process.loadEnvFile(".env.local");
} catch {
  throw new Error("Integration tests need .env.local (see .env.example) and a running `pnpm exec supabase start`.");
}
```

`tests/integration/helpers.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TestUser = { id: string; email: string; password: string };

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = () => createClient(url(), process.env.SUPABASE_SECRET_KEY!, noSession);
export const anonClient = () => createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, noSession);

/** Creates a confirmed throwaway user with a random password (local Supabase only). */
export async function createTestUser(): Promise<TestUser> {
  const email = `test-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw error;
}

export async function signedInClient(user: TestUser): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}
```

- [ ] **Step 7: Write the RLS test**

`tests/integration/rls.test.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createTestUser, deleteTestUser, signedInClient, type TestUser } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = () => new Blob([PNG], { type: "image/png" });

let alice: TestUser;
let bob: TestUser;
let aliceDb: SupabaseClient;
let bobDb: SupabaseClient;
let recipeId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
  [aliceDb, bobDb] = await Promise.all([signedInClient(alice), signedInClient(bob)]);
  const { data, error } = await aliceDb.from("recipes").insert({ user_id: alice.id, title: "Alice's soup", servings: 2 }).select("id").single();
  if (error) throw error;
  recipeId = data.id;
});

afterAll(async () => {
  await Promise.all([deleteTestUser(alice.id), deleteTestUser(bob.id)]);
});

describe("row-level security", () => {
  it("lets the owner read their recipe", async () => {
    const { data } = await aliceDb.from("recipes").select("id").eq("id", recipeId);
    expect(data).toHaveLength(1);
  });

  it("hides another user's recipe", async () => {
    const { data, error } = await bobDb.from("recipes").select("id").eq("id", recipeId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ignores updates to another user's recipe", async () => {
    await bobDb.from("recipes").update({ title: "pwned" }).eq("id", recipeId);
    const { data } = await aliceDb.from("recipes").select("title").eq("id", recipeId).single();
    expect(data?.title).toBe("Alice's soup");
  });

  it("refuses rows inserted on someone else's behalf", async () => {
    const { error } = await bobDb.from("recipes").insert({ user_id: alice.id, title: "x", servings: 1 });
    expect(error).not.toBeNull();
  });

  it("hides items from other users", async () => {
    const { error } = await aliceDb.from("items").insert({ user_id: alice.id, name: "egg", key: "egg", section: "dairy & eggs", unit_kind: "count" });
    expect(error).toBeNull();
    const { data } = await bobDb.from("items").select("id");
    expect(data).toEqual([]);
  });

  it("gives the anonymous role nothing", async () => {
    const { data } = await anonClient().from("recipes").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("keeps photos private per user", async () => {
    const path = `${alice.id}/${recipeId}/test.png`;
    expect((await aliceDb.storage.from("recipe-photos").upload(path, png())).error).toBeNull();
    expect((await bobDb.storage.from("recipe-photos").download(path)).error).not.toBeNull();
    expect((await bobDb.storage.from("recipe-photos").upload(`${alice.id}/${recipeId}/evil.png`, png())).error).not.toBeNull();
    await aliceDb.storage.from("recipe-photos").remove([path]);
  });
});
```

- [ ] **Step 8: Run the integration tests**

Run: `pnpm test:int`
Expected: PASS (7 tests). If "hides another user's recipe" fails with a permission error instead of an empty result, the `GRANT` statement didn't apply: re-check the migration output. If the storage test fails because policies can't be created on `storage.objects`, check the `pnpm db:migrate` output for an "must be owner of table objects" error and report it; don't loosen the policies.

- [ ] **Step 9: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml .gitignore .env.example supabase drizzle.config.ts db vitest.config.ts tests/integration
git commit -m "Add Supabase, Drizzle schema, migrations and row-level security" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Authentication (magic link, proxy, app shell)

**Files:**
- Create: `lib/safe-next.ts`, `lib/safe-next.test.ts`, `lib/allowed-email.ts`, `lib/allowed-email.test.ts`, `server/supabase.ts`, `server/session.ts`, `server/auth.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/login-form.tsx`, `app/login/actions.ts`, `app/auth/confirm/route.ts`, `app/(app)/layout.tsx`, `app/(app)/actions.ts`, `components/app-nav.tsx`, `components/ui.ts`
- Modify: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Produces:
  - `safeNext(next: string | null | undefined, fallback?: string): string`
  - `isAllowedEmail(email: string, allowList: string | undefined): boolean`
  - `createClient(): Promise<SupabaseClient>` from `@/server/supabase`
  - `updateSession(request: NextRequest): Promise<NextResponse>` from `@/server/session`
  - `type SessionUser = { id: string; email: string | null }`, `getUser(): Promise<SessionUser | null>` and `requireUser(next?: string): Promise<SessionUser>` from `@/server/auth`
  - `ui` class-string map from `@/components/ui`

- [ ] **Step 1: Write the failing tests**

`lib/safe-next.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site paths with query strings", () => {
    expect(safeNext("/recipes?tag=soup")).toBe("/recipes?tag=soup");
    expect(safeNext("/recipes/abc/edit")).toBe("/recipes/abc/edit");
  });
  it.each([null, undefined, "", "recipes", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/%2F%2Fevil.example"])(
    "falls back for %j",
    (next) => {
      expect(safeNext(next)).toBe("/recipes");
    },
  );
  it("uses a custom fallback", () => {
    expect(safeNext(null, "/plan")).toBe("/plan");
  });
});
```

`lib/allowed-email.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./allowed-email";

describe("isAllowedEmail", () => {
  it("matches case-insensitively and ignores spaces", () => {
    expect(isAllowedEmail("Me@Example.com", " me@example.com , other@example.com")).toBe(true);
    expect(isAllowedEmail("other@example.com", "me@example.com,other@example.com")).toBe(true);
  });
  it("rejects addresses not on the list", () => {
    expect(isAllowedEmail("stranger@example.com", "me@example.com")).toBe(false);
  });
  it("rejects everyone when the list is missing or empty", () => {
    expect(isAllowedEmail("me@example.com", undefined)).toBe(false);
    expect(isAllowedEmail("me@example.com", " , ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/safe-next.test.ts lib/allowed-email.test.ts`
Expected: FAIL, the modules can't be resolved.

- [ ] **Step 3: Implement the helpers**

`lib/safe-next.ts`:

```ts
/** Returns `next` only if it is a same-site absolute path; otherwise `fallback`. Prevents open redirects. */
export function safeNext(next: string | null | undefined, fallback = "/recipes"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;
  return next;
}
```

`lib/allowed-email.ts`:

```ts
export function isAllowedEmail(email: string, allowList: string | undefined): boolean {
  const allowed = (allowList ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
```

Run: `pnpm test lib/safe-next.test.ts lib/allowed-email.test.ts`
Expected: PASS.

- [ ] **Step 4: Supabase server client, session refresh and auth helpers**

`server/supabase.ts`:

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes the session.
        }
      },
    },
  });
}
```

`server/session.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth"];

/** Refreshes the Supabase session cookie and redirects signed-out visitors to /login?next=… */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims();

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}
```

`server/auth.ts`:

```ts
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase";

export type SessionUser = { id: string; email: string | null };

export async function getUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

/** The verified user, or a redirect to /login that returns to `next` afterwards. */
export async function requireUser(next = "/recipes"): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
```

`proxy.ts`:

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/server/session";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 5: Login page, magic-link action and confirmation route**

`components/ui.ts`:

```ts
/** Shared Tailwind class strings so forms and buttons look the same everywhere. */
export const ui = {
  page: "mx-auto w-full max-w-3xl px-4 py-6 pb-28 md:pb-10",
  h1: "text-2xl font-semibold tracking-tight",
  label: "block text-sm font-medium text-neutral-800 dark:text-neutral-200",
  hint: "mt-1 text-sm text-neutral-500 dark:text-neutral-400",
  error: "mt-1 text-sm text-red-700 dark:text-red-400",
  input:
    "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100",
  button:
    "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-60",
  buttonSecondary:
    "inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800",
  buttonDanger:
    "inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950",
  card: "rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900",
  chip: "inline-flex items-center rounded-full border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700",
  chipActive: "inline-flex items-center rounded-full border border-emerald-700 bg-emerald-700 px-3 py-1 text-sm text-white",
};
```

`app/login/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { isAllowedEmail } from "@/lib/allowed-email";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/server/supabase";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; email: string; message: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!z.email().safeParse(email).success) return { status: "error", email, message: "Enter a valid email address." };
  if (!isAllowedEmail(email, process.env.ALLOWED_EMAILS)) {
    return { status: "error", email, message: "This email isn't allowed to sign in." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.SITE_URL}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("signInWithOtp failed", error);
    return { status: "error", email, message: "Couldn't send the link. Try again in a minute." };
  }
  return { status: "sent", email };
}
```

`app/login/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <p role="status" className="text-base">
        Check <strong>{state.email}</strong> for a sign-in link. You can close this tab.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className={ui.label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.status === "error" ? state.email : ""}
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "email-error" : undefined}
          className={ui.input}
        />
        {state.status === "error" && (
          <p id="email-error" role="alert" className={ui.error}>
            {state.message}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={`${ui.button} w-full`}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
```

`app/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { ui } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";
import { getUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await getUser()) redirect(next);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-12">
      <h1 className={`${ui.h1} mb-2`}>Foodini</h1>
      <p className="mb-6 text-neutral-600 dark:text-neutral-400">Sign in to your recipes and meal plan.</p>
      {params.error === "link" && (
        <p role="alert" className={`${ui.error} mb-4`}>
          That sign-in link is invalid or has expired. Request a new one.
        </p>
      )}
      <LoginForm next={next} />
    </main>
  );
}
```

`app/auth/confirm/route.ts`:

```ts
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/server/supabase";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNext(params.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  }
  redirect("/login?error=link");
}
```

- [ ] **Step 6: The signed-in app shell and root pages**

`app/(app)/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/server/supabase";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

`components/app-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Later phases add Plan, List and Inventory here.
const TABS = [{ href: "/recipes", label: "Recipes" }];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 backdrop-blur md:static md:w-48 md:shrink-0 md:border-t-0 md:border-r md:bg-transparent dark:border-neutral-800 dark:bg-neutral-950/95"
    >
      <ul className="flex md:flex-col md:gap-1 md:p-3">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1 md:flex-none">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="block px-4 py-3 text-center text-sm font-medium text-neutral-600 aria-[current=page]:text-emerald-700 md:rounded-lg md:text-left md:aria-[current=page]:bg-emerald-50 dark:text-neutral-400 dark:aria-[current=page]:text-emerald-400 md:dark:aria-[current=page]:bg-emerald-950"
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

`app/(app)/layout.tsx`:

```tsx
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/server/auth";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <Link href="/recipes" className="text-lg font-semibold tracking-tight">
          Foodini
        </Link>
        <form action={signOut} className="flex items-center gap-3 text-sm">
          <span className="hidden text-neutral-500 sm:inline">{user.email}</span>
          <button type="submit" className="text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400">
            Sign out
          </button>
        </form>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <AppNav />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

Replace `app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/recipes");
}
```

In `app/layout.tsx`, change `metadata` to:

```ts
export const metadata: Metadata = {
  title: "Foodini",
  description: "Recipes, meal plans and grocery lists.",
};
```

In `app/globals.css`, replace the `font-family: Arial, Helvetica, sans-serif;` line with:

```css
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
```

Placeholder page so the shell renders until Task 11 replaces it. Create `app/(app)/recipes/page.tsx`:

```tsx
import { ui } from "@/components/ui";

export default function RecipesPage() {
  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>Recipes</h1>
    </main>
  );
}
```

- [ ] **Step 7: Verify the sign-in flow by hand**

1. Run: `pnpm dev`
2. Run `curl -sI http://localhost:3000/recipes | grep -i location`. Expected: `location: http://localhost:3000/login?next=%2Frecipes`.
3. Open `http://localhost:3000/recipes` in the browser. Expected: the login page.
4. Enter an email that isn't in `ALLOWED_EMAILS`. Expected: "This email isn't allowed to sign in."
5. Enter your allowed email. Expected: "Check … for a sign-in link."
6. Open Mailpit at `http://127.0.0.1:54324` and click the link. Expected: you land on `/recipes` with the header showing your email.
7. Click "Sign out". Expected: back on `/login`.

Run: `pnpm lint && pnpm test`
Expected: no lint errors; all unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/safe-next.ts lib/safe-next.test.ts lib/allowed-email.ts lib/allowed-email.test.ts server proxy.ts app components
git commit -m "Add magic-link sign-in, session proxy and app shell" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Recipe and item query helpers

**Files:**
- Create: `db/queries/items.ts`, `db/queries/recipes.ts`, `tests/integration/recipes.test.ts`

**Interfaces:**
- Consumes:
  - `db`, `sqlClient`, `DbOrTx` from `@/db`
  - Tables from `@/db/schema`
  - `parseIngredient`, `normalizeItemName` from `@/lib/ingredients`
  - `unitKind` from `@/lib/units`
  - `sectionFor` from `@/lib/sections`
  - `RecipeInput` from `@/lib/recipe-input`
- Produces:
  - `resolveItems(tx: DbOrTx, userId: string, entries: { name: string; unit: string | null }[]): Promise<Map<string, string>>`, which maps a normalized key to an item id
  - `type RecipeSummary = { id: string; title: string; servings: number; tags: string[]; imagePath: string | null }`
  - `type RecipeIngredientRow = { id: string; position: number; rawText: string; itemId: string | null; quantity: number | null; unit: string | null; note: string | null }`
  - `type RecipeDetail = RecipeSummary & { steps: string[]; sourceUrl: string | null; notes: string | null; createdAt: Date; updatedAt: Date; ingredients: RecipeIngredientRow[] }`
  - `listRecipes(userId: string, filter?: { q?: string; tag?: string }): Promise<RecipeSummary[]>`, newest-updated first
  - `listTags(userId: string): Promise<string[]>`, sorted
  - `getRecipe(userId: string, id: string): Promise<RecipeDetail | null>`
  - `createRecipe(userId: string, input: RecipeInput, opts?: { id?: string; imagePath?: string | null }): Promise<string>`
  - `updateRecipe(userId: string, id: string, input: RecipeInput, imagePath: string | null): Promise<boolean>`
  - `deleteRecipe(userId: string, id: string): Promise<{ imagePath: string | null } | null>`

- [ ] **Step 1: Write the failing integration tests**

`tests/integration/recipes.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient } from "@/db";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, listTags, updateRecipe } from "@/db/queries/recipes";
import type { RecipeInput } from "@/lib/recipe-input";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

const base: RecipeInput = {
  title: "Pancakes",
  servings: 4,
  ingredients: ["2 cups flour", "2 large eggs", "Salt to taste", "For the batter:"],
  steps: ["Whisk.", "Cook."],
  tags: ["breakfast"],
  sourceUrl: null,
  notes: null,
};

const users: TestUser[] = [];
async function newUser(): Promise<TestUser> {
  const user = await createTestUser();
  users.push(user);
  return user;
}

afterAll(async () => {
  await Promise.all(users.map((u) => deleteTestUser(u.id)));
  await sqlClient.end();
});

describe("recipe queries", () => {
  it("creates a recipe with parsed ingredients linked to items", async () => {
    const u = await newUser();
    const id = await createRecipe(u.id, base);
    const recipe = await getRecipe(u.id, id);
    expect(recipe).toMatchObject({ id, title: "Pancakes", servings: 4, steps: ["Whisk.", "Cook."], tags: ["breakfast"], imagePath: null, sourceUrl: null, notes: null });
    expect(recipe!.ingredients.map((i) => [i.position, i.rawText, i.quantity, i.unit, i.note, i.itemId !== null])).toEqual([
      [0, "2 cups flour", 2, "cup", null, true],
      [1, "2 large eggs", 2, null, "large", true],
      [2, "Salt to taste", null, null, "to taste", true],
      [3, "For the batter:", null, null, null, false],
    ]);
  });

  it("stores a new item with its section and unit kind", async () => {
    const u = await newUser();
    await createRecipe(u.id, { ...base, ingredients: ["2 cups flour", "3 Eggs"] });
    const rows = await sqlClient<{ key: string; name: string; section: string; unit_kind: string }[]>`
      select key, name, section, unit_kind from items where user_id = ${u.id} order by key`;
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { key: "egg", name: "eggs", section: "dairy & eggs", unit_kind: "count" },
      { key: "flour", name: "flour", section: "pantry", unit_kind: "volume" },
    ]);
  });

  it("reuses one item across recipes regardless of case and plural", async () => {
    const u = await newUser();
    const a = await createRecipe(u.id, { ...base, title: "A", ingredients: ["3 Eggs"] });
    const b = await createRecipe(u.id, { ...base, title: "B", ingredients: ["1 egg"] });
    const [ra, rb] = await Promise.all([getRecipe(u.id, a), getRecipe(u.id, b)]);
    expect(ra!.ingredients[0].itemId).not.toBeNull();
    expect(ra!.ingredients[0].itemId).toBe(rb!.ingredients[0].itemId);
  });

  it("keeps items separate per user", async () => {
    const [u1, u2] = await Promise.all([newUser(), newUser()]);
    const [a, b] = await Promise.all([createRecipe(u1.id, { ...base, ingredients: ["1 egg"] }), createRecipe(u2.id, { ...base, ingredients: ["1 egg"] })]);
    const [ra, rb] = await Promise.all([getRecipe(u1.id, a), getRecipe(u2.id, b)]);
    expect(ra!.ingredients[0].itemId).not.toBe(rb!.ingredients[0].itemId);
  });

  it("filters by title text, treating % and _ literally", async () => {
    const u = await newUser();
    await createRecipe(u.id, { ...base, title: "100% whole wheat bread" });
    await createRecipe(u.id, { ...base, title: "Rye bread" });
    expect((await listRecipes(u.id, { q: "100%" })).map((r) => r.title)).toEqual(["100% whole wheat bread"]);
    expect(await listRecipes(u.id, { q: "_" })).toEqual([]);
    expect((await listRecipes(u.id, { q: "BREAD" })).map((r) => r.title).sort()).toEqual(["100% whole wheat bread", "Rye bread"]);
  });

  it("filters by tag, lists distinct tags and orders newest first", async () => {
    const u = await newUser();
    await createRecipe(u.id, { ...base, title: "Soup", tags: ["dinner", "soup"] });
    await createRecipe(u.id, { ...base, title: "Toast", tags: ["breakfast"] });
    expect((await listRecipes(u.id, { tag: "soup" })).map((r) => r.title)).toEqual(["Soup"]);
    expect((await listRecipes(u.id)).map((r) => r.title)).toEqual(["Toast", "Soup"]);
    expect(await listTags(u.id)).toEqual(["breakfast", "dinner", "soup"]);
  });

  it("updates fields and replaces ingredients", async () => {
    const u = await newUser();
    const id = await createRecipe(u.id, base);
    expect(await updateRecipe(u.id, id, { ...base, title: "Crepes", ingredients: ["1 cup milk"] }, `${u.id}/${id}/p.png`)).toBe(true);
    const recipe = await getRecipe(u.id, id);
    expect(recipe).toMatchObject({ title: "Crepes", imagePath: `${u.id}/${id}/p.png` });
    expect(recipe!.ingredients.map((i) => i.rawText)).toEqual(["1 cup milk"]);
  });

  it("never reads, updates or deletes another user's recipe", async () => {
    const [owner, other] = await Promise.all([newUser(), newUser()]);
    const id = await createRecipe(owner.id, base);
    expect(await getRecipe(other.id, id)).toBeNull();
    expect(await updateRecipe(other.id, id, { ...base, title: "Stolen" }, null)).toBe(false);
    expect(await deleteRecipe(other.id, id)).toBeNull();
    expect((await getRecipe(owner.id, id))?.title).toBe("Pancakes");
    expect(await listRecipes(other.id)).toEqual([]);
  });

  it("returns null for ids that are not UUIDs", async () => {
    const u = await newUser();
    expect(await getRecipe(u.id, "not-a-uuid")).toBeNull();
    expect(await updateRecipe(u.id, "not-a-uuid", base, null)).toBe(false);
    expect(await deleteRecipe(u.id, "not-a-uuid")).toBeNull();
  });

  it("creates with a caller-supplied id and image path", async () => {
    const u = await newUser();
    const id = crypto.randomUUID();
    expect(await createRecipe(u.id, base, { id, imagePath: `${u.id}/${id}/a.jpg` })).toBe(id);
    expect((await getRecipe(u.id, id))?.imagePath).toBe(`${u.id}/${id}/a.jpg`);
  });

  it("deletes a recipe and its ingredients", async () => {
    const u = await newUser();
    const id = await createRecipe(u.id, base);
    expect(await deleteRecipe(u.id, id)).toEqual({ imagePath: null });
    expect(await getRecipe(u.id, id)).toBeNull();
    const [{ n }] = await sqlClient<{ n: number }[]>`select count(*)::int as n from recipe_ingredients where recipe_id = ${id}`;
    expect(n).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int tests/integration/recipes.test.ts`
Expected: FAIL, "Failed to resolve import @/db/queries/recipes".

- [ ] **Step 3: Implement `db/queries/items.ts`**

```ts
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { items } from "@/db/schema";
import { normalizeItemName } from "@/lib/ingredients";
import { sectionFor } from "@/lib/sections";
import { unitKind } from "@/lib/units";

/**
 * Finds or creates one item per distinct normalized name for this user.
 * Returns normalized key → item id. New items get a default section and the unit kind of the
 * first unit they appear with (count when there is none).
 */
export async function resolveItems(
  tx: DbOrTx,
  userId: string,
  entries: { name: string; unit: string | null }[],
): Promise<Map<string, string>> {
  const byKey = new Map<string, { name: string; unit: string | null }>();
  for (const entry of entries) {
    const key = normalizeItemName(entry.name);
    if (key && !byKey.has(key)) byKey.set(key, entry);
  }
  if (byKey.size === 0) return new Map();

  await tx
    .insert(items)
    .values(
      [...byKey].map(([key, entry]) => ({
        userId,
        key,
        name: entry.name,
        section: sectionFor(entry.name),
        unitKind: entry.unit ? unitKind(entry.unit) : ("count" as const),
      })),
    )
    .onConflictDoNothing({ target: [items.userId, items.key] });

  const rows = await tx
    .select({ id: items.id, key: items.key })
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.key, [...byKey.keys()])));
  return new Map(rows.map((r) => [r.key, r.id]));
}
```

- [ ] **Step 4: Implement `db/queries/recipes.ts`**

```ts
import "server-only";
import { and, arrayContains, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { recipeIngredients, recipes } from "@/db/schema";
import { normalizeItemName, parseIngredient } from "@/lib/ingredients";
import type { RecipeInput } from "@/lib/recipe-input";
import { resolveItems } from "./items";

export type RecipeSummary = { id: string; title: string; servings: number; tags: string[]; imagePath: string | null };
export type RecipeIngredientRow = {
  id: string;
  position: number;
  rawText: string;
  itemId: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};
export type RecipeDetail = RecipeSummary & {
  steps: string[];
  sourceUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  ingredients: RecipeIngredientRow[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summaryColumns = {
  id: recipes.id,
  title: recipes.title,
  servings: recipes.servings,
  tags: recipes.tags,
  imagePath: recipes.imagePath,
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function recipeColumns(input: RecipeInput) {
  return {
    title: input.title,
    servings: input.servings,
    steps: input.steps,
    tags: input.tags,
    sourceUrl: input.sourceUrl,
    notes: input.notes,
  };
}

async function insertIngredients(tx: DbOrTx, userId: string, recipeId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const parsed = lines.map(parseIngredient);
  const itemIds = await resolveItems(
    tx,
    userId,
    parsed.flatMap((p) => (p.name ? [{ name: p.name, unit: p.unit }] : [])),
  );
  await tx.insert(recipeIngredients).values(
    parsed.map((p, position) => ({
      userId,
      recipeId,
      position,
      rawText: p.raw,
      itemId: p.name ? (itemIds.get(normalizeItemName(p.name)) ?? null) : null,
      quantity: p.quantity,
      unit: p.unit,
      note: p.note,
    })),
  );
}

export async function listRecipes(userId: string, filter: { q?: string; tag?: string } = {}): Promise<RecipeSummary[]> {
  const conditions = [eq(recipes.userId, userId)];
  if (filter.q) conditions.push(ilike(recipes.title, `%${escapeLike(filter.q)}%`));
  if (filter.tag) conditions.push(arrayContains(recipes.tags, [filter.tag]));
  return db
    .select(summaryColumns)
    .from(recipes)
    .where(and(...conditions))
    .orderBy(desc(recipes.updatedAt), asc(recipes.title));
}

export async function listTags(userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tag: sql<string>`unnest(${recipes.tags})` })
    .from(recipes)
    .where(eq(recipes.userId, userId));
  return rows.map((r) => r.tag).sort();
}

export async function getRecipe(userId: string, id: string): Promise<RecipeDetail | null> {
  if (!UUID.test(id)) return null;
  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
  if (!recipe) return null;
  const ingredients = await db
    .select({
      id: recipeIngredients.id,
      position: recipeIngredients.position,
      rawText: recipeIngredients.rawText,
      itemId: recipeIngredients.itemId,
      quantity: recipeIngredients.quantity,
      unit: recipeIngredients.unit,
      note: recipeIngredients.note,
    })
    .from(recipeIngredients)
    .where(and(eq(recipeIngredients.recipeId, id), eq(recipeIngredients.userId, userId)))
    .orderBy(asc(recipeIngredients.position));
  return {
    id: recipe.id,
    title: recipe.title,
    servings: recipe.servings,
    tags: recipe.tags,
    imagePath: recipe.imagePath,
    steps: recipe.steps,
    sourceUrl: recipe.sourceUrl,
    notes: recipe.notes,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    ingredients,
  };
}

export async function createRecipe(
  userId: string,
  input: RecipeInput,
  opts: { id?: string; imagePath?: string | null } = {},
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recipes)
      .values({ ...recipeColumns(input), userId, imagePath: opts.imagePath ?? null, ...(opts.id ? { id: opts.id } : {}) })
      .returning({ id: recipes.id });
    await insertIngredients(tx, userId, row.id, input.ingredients);
    return row.id;
  });
}

export async function updateRecipe(userId: string, id: string, input: RecipeInput, imagePath: string | null): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(recipes)
      .set({ ...recipeColumns(input), imagePath, updatedAt: new Date() })
      .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
      .returning({ id: recipes.id });
    if (updated.length === 0) return false;
    await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    await insertIngredients(tx, userId, id, input.ingredients);
    return true;
  });
}

export async function deleteRecipe(userId: string, id: string): Promise<{ imagePath: string | null } | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .delete(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .returning({ imagePath: recipes.imagePath });
  return row ?? null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:int`
Expected: PASS (the RLS tests and all recipe query tests). The "orders newest first" assertion depends on `updatedAt` differing between two inserts made milliseconds apart. If it's flaky, don't weaken it: set `updatedAt: new Date()` explicitly in `createRecipe`'s values so each insert gets its own timestamp.

- [ ] **Step 6: Commit**

```bash
git add db/queries tests/integration/recipes.test.ts
git commit -m "Add recipe and item query helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Recipe form, save/import actions and photo uploads

**Files:**
- Create: `server/photos.ts`, `app/(app)/recipes/actions.ts`, `app/(app)/recipes/recipe-editor.tsx`, `app/(app)/recipes/new/page.tsx`, `app/(app)/recipes/[id]/edit/page.tsx`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes:
  - `requireUser` (Task 8)
  - `createRecipe`, `updateRecipe`, `getRecipe`, `deleteRecipe` (Task 9)
  - `readRecipeForm`, `validateRecipe`, `draftToFormValues`, `recipeToFormValues`, `EMPTY_RECIPE_FORM`, `RecipeFormValues`, `FieldErrors` (Task 4)
  - `checkPhoto`, `PHOTO_TYPES` (Task 4)
  - `fetchPage`, `FetchPageError` (Task 6)
  - `extractRecipe`, `extractTitle`, `RecipeDraft` (Task 5)
  - `parseIngredient` (Task 2), `formatQuantity`, `unitLabel` (Task 1), `ui` (Task 8)
- Produces:
  - `uploadPhoto(userId: string, recipeId: string, file: File): Promise<string>`, `removePhoto(path: string): Promise<void>` and `photoUrls(paths: string[]): Promise<Map<string, string>>` from `@/server/photos`
  - `type RecipeFormState = { values: RecipeFormValues; fieldErrors: FieldErrors; message?: string } | null`
  - `saveRecipe(recipeId: string | null, prev: RecipeFormState, formData: FormData): Promise<RecipeFormState>`
  - `deleteRecipeAction(recipeId: string, formData?: FormData): Promise<void>`
  - `importRecipe(url: string): Promise<{ ok: true; draft: RecipeDraft } | { ok: false; message: string; draft?: RecipeDraft }>`
  - `RecipeEditor` client component with props `{ action, initial: RecipeFormValues, hasPhoto?: boolean, showImport?: boolean, submitLabel: string }`

- [ ] **Step 1: Raise the Server Action body limit for 5 MB photos**

Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos are capped at 5 MB; leave room for multipart overhead and the other fields.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 2: Photo storage helpers**

`server/photos.ts`:

```ts
import "server-only";
import { PHOTO_TYPES } from "@/lib/photo-rules";
import { createClient } from "./supabase";

const BUCKET = "recipe-photos";

/** Uploads as the signed-in user; storage policies only allow paths under their own user id. */
export async function uploadPhoto(userId: string, recipeId: string, file: File): Promise<string> {
  const path = `${userId}/${recipeId}/${crypto.randomUUID()}.${PHOTO_TYPES[file.type]}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function removePhoto(path: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("removePhoto failed", path, error);
}

/** Signed URLs valid for one hour, keyed by storage path. Missing or failed paths are omitted. */
export async function photoUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    console.error("photoUrls failed", error);
    return new Map();
  }
  return new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as [string, string]] : [])));
}
```

- [ ] **Step 3: Server Actions**

`app/(app)/recipes/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createRecipe, deleteRecipe, getRecipe, updateRecipe } from "@/db/queries/recipes";
import { FetchPageError, fetchPage } from "@/lib/fetch-page";
import { extractRecipe, extractTitle, type RecipeDraft } from "@/lib/import";
import { checkPhoto } from "@/lib/photo-rules";
import { readRecipeForm, validateRecipe, type FieldErrors, type RecipeFormValues } from "@/lib/recipe-input";
import { requireUser } from "@/server/auth";
import { removePhoto, uploadPhoto } from "@/server/photos";

export type RecipeFormState = { values: RecipeFormValues; fieldErrors: FieldErrors; message?: string } | null;

export async function saveRecipe(recipeId: string | null, _prev: RecipeFormState, formData: FormData): Promise<RecipeFormState> {
  const user = await requireUser();
  const values = readRecipeForm(formData);
  const parsed = validateRecipe(values);
  const photoEntry = formData.get("photo");
  const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  const photoCheck = checkPhoto(photo);

  if (!parsed.ok || !photoCheck.ok) {
    return {
      values,
      fieldErrors: { ...(parsed.ok ? {} : parsed.fieldErrors), ...(photoCheck.ok ? {} : { photo: photoCheck.message }) },
    };
  }

  // Ownership check happens before any upload; notFound() must stay outside the try below.
  const existing = recipeId ? await getRecipe(user.id, recipeId) : null;
  if (recipeId && !existing) notFound();
  const id = recipeId ?? crypto.randomUUID();
  const removeCurrent = formData.get("removePhoto") === "on";

  try {
    const uploaded = photo ? await uploadPhoto(user.id, id, photo) : null;
    const imagePath = uploaded ?? (removeCurrent ? null : (existing?.imagePath ?? null));
    if (existing) await updateRecipe(user.id, id, parsed.data, imagePath);
    else await createRecipe(user.id, parsed.data, { id, imagePath });
    if (existing?.imagePath && existing.imagePath !== imagePath) await removePhoto(existing.imagePath);
  } catch (error) {
    console.error("saveRecipe failed", error);
    return { values, fieldErrors: {}, message: "Couldn't save the recipe. Please try again." };
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${id}`);
}

export async function deleteRecipeAction(recipeId: string, _formData?: FormData): Promise<void> {
  const user = await requireUser();
  const deleted = await deleteRecipe(user.id, recipeId);
  if (deleted?.imagePath) await removePhoto(deleted.imagePath);
  revalidatePath("/recipes");
  redirect("/recipes");
}

export async function importRecipe(
  url: string,
): Promise<{ ok: true; draft: RecipeDraft } | { ok: false; message: string; draft?: RecipeDraft }> {
  await requireUser();
  if (typeof url !== "string" || !url.trim()) return { ok: false, message: "Paste a recipe link first." };

  const allowPrivate = process.env.NODE_ENV !== "production" && process.env.IMPORT_ALLOW_PRIVATE === "1";
  try {
    const page = await fetchPage(url.trim(), { allowPrivate });
    const draft = extractRecipe(page.html, page.url);
    if (draft) return { ok: true, draft };
    return {
      ok: false,
      message: "Couldn't find a recipe on that page. You can enter it by hand below.",
      draft: { title: extractTitle(page.html) ?? "", servings: null, ingredients: [], steps: [], tags: [], sourceUrl: page.url },
    };
  } catch (error) {
    if (error instanceof FetchPageError) return { ok: false, message: error.message };
    console.error("importRecipe failed", error);
    return { ok: false, message: "Something went wrong fetching that page." };
  }
}
```

- [ ] **Step 4: The recipe editor (client)**

`app/(app)/recipes/recipe-editor.tsx`:

```tsx
"use client";

import { useActionState, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { parseIngredient } from "@/lib/ingredients";
import { draftToFormValues, type RecipeFormValues } from "@/lib/recipe-input";
import { formatQuantity, unitLabel } from "@/lib/units";
import { importRecipe, type RecipeFormState } from "./actions";

type SaveAction = (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;

type EditorProps = {
  action: SaveAction;
  initial: RecipeFormValues;
  hasPhoto?: boolean;
  showImport?: boolean;
  submitLabel: string;
};

export function RecipeEditor({ action, initial, hasPhoto = false, showImport = false, submitLabel }: EditorProps) {
  const [draft, setDraft] = useState(initial);
  // Bumping the key remounts the form, which also clears any previous submission state.
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      {showImport && (
        <ImportBox
          onDraft={(values) => {
            setDraft(values);
            setVersion((v) => v + 1);
          }}
        />
      )}
      <RecipeFields key={version} action={action} initial={draft} hasPhoto={hasPhoto} submitLabel={submitLabel} />
    </div>
  );
}

function ImportBox({ onDraft }: { onDraft: (values: RecipeFormValues) => void }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runImport() {
    startTransition(async () => {
      setMessage(null);
      const result = await importRecipe(url);
      if (result.ok) {
        onDraft(draftToFormValues(result.draft));
        setMessage("Imported. Review the recipe below, then save.");
      } else {
        if (result.draft) onDraft(draftToFormValues(result.draft));
        setMessage(result.message);
      }
    });
  }

  return (
    <section aria-labelledby="import-heading" className={ui.card}>
      <h2 id="import-heading" className="text-base font-semibold">
        Import from a URL
      </h2>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runImport();
        }}
      >
        <label htmlFor="import-url" className="sr-only">
          Recipe URL
        </label>
        <input id="import-url" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className={`${ui.input} mt-0`} />
        <button type="submit" disabled={pending || !url.trim()} className={ui.buttonSecondary}>
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
      {message && (
        <p role="status" className={ui.hint}>
          {message}
        </p>
      )}
    </section>
  );
}

function RecipeFields({ action, initial, hasPhoto, submitLabel }: Omit<EditorProps, "showImport">) {
  const [state, formAction, pending] = useActionState(action, null);
  // After a failed save the action returns what was submitted; React resets uncontrolled fields
  // to these defaults, so nothing typed is lost.
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};
  const [ingredients, setIngredients] = useState(initial.ingredients);

  const describedBy = (name: keyof typeof errors, hint?: string) =>
    [errors[name] ? `${name}-error` : null, hint ?? null].filter(Boolean).join(" ") || undefined;
  const fieldError = (name: keyof typeof errors) =>
    errors[name] ? (
      <p id={`${name}-error`} className={ui.error}>
        {errors[name]}
      </p>
    ) : null;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.message && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}
      {Object.keys(errors).length > 0 && !state?.message && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Please fix the highlighted fields.
        </p>
      )}

      <div>
        <label htmlFor="title" className={ui.label}>
          Title
        </label>
        <input id="title" name="title" defaultValue={values.title} aria-invalid={!!errors.title} aria-describedby={describedBy("title")} className={ui.input} />
        {fieldError("title")}
      </div>

      <div className="w-32">
        <label htmlFor="servings" className={ui.label}>
          Servings
        </label>
        <input id="servings" name="servings" type="number" inputMode="numeric" min={1} max={100} defaultValue={values.servings} aria-invalid={!!errors.servings} aria-describedby={describedBy("servings")} className={ui.input} />
        {fieldError("servings")}
      </div>

      <div>
        <label htmlFor="ingredients" className={ui.label}>
          Ingredients
        </label>
        <p id="ingredients-hint" className={ui.hint}>
          One per line, e.g. “1 ½ cups flour, sifted”.
        </p>
        <textarea
          id="ingredients"
          name="ingredients"
          rows={8}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          aria-invalid={!!errors.ingredients}
          aria-describedby={describedBy("ingredients", "ingredients-hint")}
          className={`${ui.input} font-mono text-sm`}
        />
        {fieldError("ingredients")}
        <IngredientPreview text={ingredients} />
      </div>

      <div>
        <label htmlFor="steps" className={ui.label}>
          Steps
        </label>
        <p id="steps-hint" className={ui.hint}>
          One step per line.
        </p>
        <textarea id="steps" name="steps" rows={6} defaultValue={values.steps} aria-invalid={!!errors.steps} aria-describedby={describedBy("steps", "steps-hint")} className={ui.input} />
        {fieldError("steps")}
      </div>

      <div>
        <label htmlFor="tags" className={ui.label}>
          Tags
        </label>
        <p id="tags-hint" className={ui.hint}>
          Separate with commas.
        </p>
        <input id="tags" name="tags" defaultValue={values.tags} aria-invalid={!!errors.tags} aria-describedby={describedBy("tags", "tags-hint")} className={ui.input} />
        {fieldError("tags")}
      </div>

      <div>
        <label htmlFor="sourceUrl" className={ui.label}>
          Source URL
        </label>
        <input id="sourceUrl" name="sourceUrl" type="url" inputMode="url" defaultValue={values.sourceUrl} aria-invalid={!!errors.sourceUrl} aria-describedby={describedBy("sourceUrl")} className={ui.input} />
        {fieldError("sourceUrl")}
      </div>

      <div>
        <label htmlFor="notes" className={ui.label}>
          Notes
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={values.notes} aria-invalid={!!errors.notes} aria-describedby={describedBy("notes")} className={ui.input} />
        {fieldError("notes")}
      </div>

      <div>
        <label htmlFor="photo" className={ui.label}>
          Photo
        </label>
        <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-invalid={!!errors.photo} aria-describedby={describedBy("photo", "photo-hint")} className="mt-1 block text-sm" />
        <p id="photo-hint" className={ui.hint}>
          JPEG, PNG or WebP, up to 5 MB.{errors.photo ? " Choose the photo again after fixing other fields." : ""}
        </p>
        {fieldError("photo")}
        {hasPhoto && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="removePhoto" /> Remove current photo
          </label>
        )}
      </div>

      <button type="submit" disabled={pending} className={ui.button}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function IngredientPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ul aria-label="How each ingredient was read" className="mt-2 space-y-1 text-sm">
      {lines.map((line, i) => {
        const p = parseIngredient(line);
        if (p.name === null && p.quantity === null) {
          return (
            <li key={i} className="text-amber-800 dark:text-amber-400">
              ⚠ Couldn’t read “{line}”. It will be kept as written.
            </li>
          );
        }
        const parts = [p.quantity !== null ? formatQuantity(p.quantity) : null, p.unit ? unitLabel(p.unit, p.quantity ?? 1) : null, p.name];
        return (
          <li key={i} className="text-neutral-600 dark:text-neutral-400">
            {parts.filter(Boolean).join(" · ")}
            {p.note && <span className="text-neutral-400 dark:text-neutral-500"> ({p.note})</span>}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: New and edit pages**

`app/(app)/recipes/new/page.tsx`:

```tsx
import { ui } from "@/components/ui";
import { EMPTY_RECIPE_FORM } from "@/lib/recipe-input";
import { requireUser } from "@/server/auth";
import { saveRecipe } from "../actions";
import { RecipeEditor } from "../recipe-editor";

export default async function NewRecipePage() {
  await requireUser("/recipes/new");
  return (
    <main className={ui.page}>
      <h1 className={`${ui.h1} mb-6`}>New recipe</h1>
      <RecipeEditor action={saveRecipe.bind(null, null)} initial={EMPTY_RECIPE_FORM} showImport submitLabel="Save recipe" />
    </main>
  );
}
```

`app/(app)/recipes/[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import { getRecipe } from "@/db/queries/recipes";
import { recipeToFormValues } from "@/lib/recipe-input";
import { requireUser } from "@/server/auth";
import { saveRecipe } from "../../actions";
import { RecipeEditor } from "../../recipe-editor";

export default async function EditRecipePage(props: PageProps<"/recipes/[id]/edit">) {
  const { id } = await props.params;
  const user = await requireUser(`/recipes/${id}/edit`);
  const recipe = await getRecipe(user.id, id);
  if (!recipe) notFound();

  return (
    <main className={ui.page}>
      <h1 className={`${ui.h1} mb-6`}>Edit recipe</h1>
      <RecipeEditor action={saveRecipe.bind(null, recipe.id)} initial={recipeToFormValues(recipe)} hasPhoto={recipe.imagePath !== null} submitLabel="Save changes" />
    </main>
  );
}
```

- [ ] **Step 6: Verify by hand**

Run: `pnpm dev`, sign in, open `http://localhost:3000/recipes/new`.

1. Type `2 cups flour`, `For the batter:` and `3 eggs` in Ingredients. Expected: the preview shows `2 · cups · flour`, a ⚠ line for "For the batter:", and `3 · eggs`.
2. Click "Save recipe" with an empty title. Expected: "Title is required" under Title, and the ingredients are still there.
3. Fill in Title and Servings, attach a PNG under 5 MB, and save. Expected: you're redirected to `/recipes/<uuid>`. That page is still a 404 until Task 11, which is expected. The save itself works: check it with `pnpm exec supabase status`, then Studio at `http://127.0.0.1:54323`, where the recipe has a row in `recipes` and the photo is in the `recipe-photos` bucket.
4. Paste a real recipe URL (any major recipe site) into "Import from a URL" and click Import. Expected: the fields fill in, with no save yet.
5. Import `http://127.0.0.1:3000/`. Expected: "That address can't be imported." (without `IMPORT_ALLOW_PRIVATE`).

Run: `pnpm lint && pnpm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add next.config.ts server/photos.ts "app/(app)/recipes"
git commit -m "Add recipe editor with URL import and photo upload" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Recipe list and detail pages

**Files:**
- Modify: `app/(app)/recipes/page.tsx` (replaces the Task 8 placeholder)
- Create: `app/(app)/recipes/[id]/page.tsx`, `app/(app)/recipes/[id]/servings-scaler.tsx`, `app/(app)/recipes/[id]/delete-button.tsx`, `app/(app)/recipes/[id]/not-found.tsx`, `app/(app)/recipes/error.tsx`

**Interfaces:**
- Consumes:
  - `listRecipes`, `listTags`, `getRecipe` (Task 9)
  - `photoUrls` (Task 10)
  - `deleteRecipeAction` (Task 10)
  - `parseIngredient`, `formatIngredient` (Task 2)
  - `requireUser`, `ui` (Task 8)
- Produces: pages only.

- [ ] **Step 1: The list page**

Replace `app/(app)/recipes/page.tsx`:

```tsx
import Link from "next/link";
import { ui } from "@/components/ui";
import { listRecipes, listTags } from "@/db/queries/recipes";
import { requireUser } from "@/server/auth";
import { photoUrls } from "@/server/photos";

const hrefWith = (params: { q?: string; tag?: string }) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return search ? `/recipes?${search}` : "/recipes";
};

export default async function RecipesPage(props: PageProps<"/recipes">) {
  const user = await requireUser("/recipes");
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const tag = typeof params.tag === "string" ? params.tag : "";

  const [recipes, tags] = await Promise.all([listRecipes(user.id, { q, tag }), listTags(user.id)]);
  const photos = await photoUrls(recipes.flatMap((r) => (r.imagePath ? [r.imagePath] : [])));
  const filtering = Boolean(q || tag);

  return (
    <main className={ui.page}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className={ui.h1}>Recipes</h1>
        <Link href="/recipes/new" className={ui.button}>
          New recipe
        </Link>
      </div>

      <form role="search" action="/recipes" className="mb-3 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search recipes
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Search by title" className={`${ui.input} mt-0`} />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button type="submit" className={ui.buttonSecondary}>
          Search
        </button>
      </form>

      {tags.length > 0 && (
        <nav aria-label="Filter by tag" className="mb-5 flex flex-wrap gap-2">
          <Link href={hrefWith({ q })} className={tag ? ui.chip : ui.chipActive} aria-current={tag ? undefined : "page"}>
            All
          </Link>
          {tags.map((t) => (
            <Link key={t} href={hrefWith({ q, tag: t })} className={t === tag ? ui.chipActive : ui.chip} aria-current={t === tag ? "page" : undefined}>
              {t}
            </Link>
          ))}
        </nav>
      )}

      {recipes.length === 0 ? (
        <div className={`${ui.card} text-center`}>
          {filtering ? (
            <p>
              No recipes match.{" "}
              <Link href="/recipes" className="text-emerald-700 underline dark:text-emerald-400">
                Clear filters
              </Link>
            </p>
          ) : (
            <p>
              No recipes yet.{" "}
              <Link href="/recipes/new" className="text-emerald-700 underline dark:text-emerald-400">
                Add your first one
              </Link>{" "}
              or import one from a link.
            </p>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {recipes.map((r) => {
            const photo = r.imagePath ? photos.get(r.imagePath) : undefined;
            return (
              <li key={r.id}>
                <Link href={`/recipes/${r.id}`} className={`${ui.card} flex gap-3 hover:border-emerald-600`}>
                  {photo ? (
                    // Signed Supabase URLs; next/image would need per-environment remotePatterns.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div aria-hidden className="size-16 shrink-0 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="text-sm text-neutral-500">
                      {r.servings} serving{r.servings === 1 ? "" : "s"}
                    </p>
                    {r.tags.length > 0 && <p className="truncate text-sm text-neutral-500">{r.tags.join(" · ")}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: The detail page, servings scaler and delete button**

`app/(app)/recipes/[id]/servings-scaler.tsx`:

```tsx
"use client";

import { useState } from "react";
import { formatIngredient, parseIngredient } from "@/lib/ingredients";

export function ServingsScaler({ baseServings, ingredients }: { baseServings: number; ingredients: string[] }) {
  const [servings, setServings] = useState(baseServings);
  const factor = servings / baseServings;
  const stepper = "size-9 rounded-full border border-neutral-300 text-lg leading-none disabled:opacity-40 dark:border-neutral-700";

  return (
    <section aria-labelledby="ingredients-heading">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="ingredients-heading" className="text-lg font-semibold">
          Ingredients
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Fewer servings" className={stepper} disabled={servings <= 1} onClick={() => setServings((s) => Math.max(1, s - 1))}>
            −
          </button>
          <span aria-live="polite" className="min-w-24 text-center text-sm">
            {servings} serving{servings === 1 ? "" : "s"}
          </span>
          <button type="button" aria-label="More servings" className={stepper} disabled={servings >= 100} onClick={() => setServings((s) => Math.min(100, s + 1))}>
            +
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {ingredients.map((raw, i) => (
          <li key={i} className="border-b border-neutral-100 pb-2 dark:border-neutral-800">
            {formatIngredient(parseIngredient(raw), factor)}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`app/(app)/recipes/[id]/delete-button.tsx`:

```tsx
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
```

`app/(app)/recipes/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ui } from "@/components/ui";
import { getRecipe } from "@/db/queries/recipes";
import { requireUser } from "@/server/auth";
import { photoUrls } from "@/server/photos";
import { deleteRecipeAction } from "../actions";
import { DeleteRecipeButton } from "./delete-button";
import { ServingsScaler } from "./servings-scaler";

export default async function RecipePage(props: PageProps<"/recipes/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/recipes/${id}`);
  const recipe = await getRecipe(user.id, id);
  if (!recipe) notFound();

  const photo = recipe.imagePath ? (await photoUrls([recipe.imagePath])).get(recipe.imagePath) : undefined;
  const sourceHost = recipe.sourceUrl ? new URL(recipe.sourceUrl).hostname : null;

  return (
    <main className={ui.page}>
      <Link href="/recipes" className="text-sm text-neutral-500 hover:underline">
        ← Recipes
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className={ui.h1}>{recipe.title}</h1>
        <div className="flex gap-2">
          <Link href={`/recipes/${recipe.id}/edit`} className={ui.buttonSecondary}>
            Edit
          </Link>
          <DeleteRecipeButton action={deleteRecipeAction.bind(null, recipe.id)} title={recipe.title} />
        </div>
      </div>

      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={recipe.title} className="mb-6 max-h-80 w-full rounded-xl object-cover" />
      )}

      {recipe.tags.length > 0 && (
        <ul aria-label="Tags" className="mb-6 flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <li key={t}>
              <Link href={`/recipes?tag=${encodeURIComponent(t)}`} className={ui.chip}>
                {t}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-8 md:grid-cols-[2fr_3fr]">
        <ServingsScaler baseServings={recipe.servings} ingredients={recipe.ingredients.map((i) => i.rawText)} />
        {recipe.steps.length > 0 && (
          <section aria-labelledby="steps-heading">
            <h2 id="steps-heading" className="mb-3 text-lg font-semibold">
              Steps
            </h2>
            <ol className="list-decimal space-y-3 pl-5">
              {recipe.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {recipe.notes && (
        <section aria-labelledby="notes-heading" className="mt-8">
          <h2 id="notes-heading" className="mb-2 text-lg font-semibold">
            Notes
          </h2>
          <p className="whitespace-pre-line">{recipe.notes}</p>
        </section>
      )}

      {recipe.sourceUrl && (
        <p className="mt-8 text-sm">
          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline dark:text-emerald-400">
            View original ({sourceHost})
          </a>
        </p>
      )}
    </main>
  );
}
```

`app/(app)/recipes/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import { ui } from "@/components/ui";

export default function RecipeNotFound() {
  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>Recipe not found</h1>
      <p className="mt-2">It may have been deleted.</p>
      <Link href="/recipes" className={`${ui.buttonSecondary} mt-4`}>
        Back to recipes
      </Link>
    </main>
  );
}
```

`app/(app)/recipes/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { ui } from "@/components/ui";

export default function RecipesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>Something went wrong</h1>
      <p className="mt-2">We couldn’t load your recipes.</p>
      <button type="button" onClick={() => retry()} className={`${ui.button} mt-4`}>
        Try again
      </button>
    </main>
  );
}
```

- [ ] **Step 3: Verify by hand**

Run: `pnpm dev`, sign in.

1. `/recipes` with no recipes. Expected: "No recipes yet" with a link to add one.
2. Create two recipes with different tags. Expected: both appear with a photo or a placeholder square. Tag chips filter the list; "All" clears the filter.
3. Search "100%" with a recipe titled "100% rye". Expected: only that recipe.
4. Open a recipe. Expected: ingredients show exactly as typed. Press "+" until the count doubles. Expected: "2 cups flour" becomes "4 cups flour".
5. Open `/recipes/not-a-uuid`. Expected: "Recipe not found" (a 404, not an error page).
6. Delete a recipe. Expected: a confirmation dialog, then back on the list without it.
7. At a phone width (375 px in dev tools): nav tabs sit at the bottom, and there's no horizontal scroll.

Run: `pnpm lint && pnpm test && pnpm test:int`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/recipes"
git commit -m "Add recipe list, detail page and servings scaler" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: End-to-end tests and setup docs

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/recipes.spec.ts`
- Modify: `package.json` (script), `.gitignore`, `README.md`

**Interfaces:**
- Consumes the whole app. The tests sign in by generating a magic link with the admin API and visiting `/auth/confirm` directly (test-only; this uses the local secret key).

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Add to the `package.json` scripts: `"test:e2e": "playwright test"`.

Append to `.gitignore`:

```
# playwright
/test-results/
/playwright-report/
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the environment directly.
}

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // A separate port so it never collides with your own `pnpm dev`. Stop that first if Next
    // reports another dev server is already running in this directory.
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Lets the import test fetch its fixture from a local server; ignored in production.
    env: { ...(process.env as Record<string, string>), IMPORT_ALLOW_PRIVATE: "1" },
  },
});
```

- [ ] **Step 2: Sign-in helper**

`tests/e2e/helpers.ts`:

```ts
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Creates a throwaway user and signs the page in through the real /auth/confirm route. */
export async function signInAsNewUser(page: Page): Promise<{ id: string }> {
  const email = `e2e-${crypto.randomUUID()}@example.test`;
  const { data: created, error: createError } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (createError) throw createError;
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=/recipes`);
  await page.waitForURL("**/recipes");
  return { id: created.user.id };
}

export async function deleteUser(id: string): Promise<void> {
  await admin().auth.admin.deleteUser(id);
}
```

- [ ] **Step 3: Write the end-to-end tests**

`tests/e2e/recipes.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deleteUser, signInAsNewUser } from "./helpers";

const SOUP_PAGE = `<!doctype html><html><head><title>Soup | Test Kitchen</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Tomato Soup",
  recipeYield: "4",
  recipeIngredient: ["2 tbsp olive oil", "1 (28 oz) can crushed tomatoes"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Simmer 20 minutes." }],
  keywords: "soup, dinner",
})}</script></head><body><h1>Tomato Soup</h1></body></html>`;

test("signed-out visitors go to login and keep their destination", async ({ page }) => {
  await page.goto("/recipes?tag=soup");
  await expect(page).toHaveURL(/\/login\?next=%2Frecipes%3Ftag%3Dsoup$/);
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

test("an invalid sign-in link explains itself", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=email");
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
});

test.describe("signed in", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("create, scale, edit and delete a recipe", async ({ page }) => {
    await expect(page.getByText("No recipes yet")).toBeVisible();
    await page.getByRole("link", { name: "New recipe" }).click();

    await page.getByLabel("Title", { exact: true }).fill("Pancakes");
    await page.getByLabel("Servings", { exact: true }).fill("4");
    await page.getByLabel("Ingredients", { exact: true }).fill("2 cups flour\n1 ½ cups milk\n2 large eggs\nFor the batter:");
    await expect(page.getByText("Couldn’t read “For the batter:”")).toBeVisible();
    await page.getByLabel("Steps", { exact: true }).fill("Whisk.\nCook.");
    await page.getByLabel("Tags", { exact: true }).fill("Breakfast, sweet");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Pancakes" })).toBeVisible();
    await expect(page.getByText("2 cups flour")).toBeVisible();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "More servings" }).click();
    await expect(page.getByText("8 servings")).toBeVisible();
    await expect(page.getByText("4 cups flour")).toBeVisible();
    await expect(page.getByText("3 cups milk")).toBeVisible();

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Title", { exact: true }).fill("Fluffy pancakes");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Fluffy pancakes" })).toBeVisible();

    await page.getByRole("link", { name: "← Recipes" }).click();
    await page.getByRole("link", { name: "breakfast", exact: true }).click();
    await expect(page.getByRole("link", { name: /Fluffy pancakes/ })).toBeVisible();

    await page.getByRole("link", { name: /Fluffy pancakes/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByText("No recipes yet")).toBeVisible();
  });

  test("validation errors keep what was typed", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByLabel("Ingredients", { exact: true }).fill("3 eggs");
    await page.getByLabel("Steps", { exact: true }).fill("Scramble.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();
    await expect(page.getByText("Servings is required")).toBeVisible();
    await expect(page.getByLabel("Ingredients", { exact: true })).toHaveValue("3 eggs");
    await expect(page.getByLabel("Steps", { exact: true })).toHaveValue("Scramble.");
  });

  test("another user's recipe is a 404", async ({ page, browser }) => {
    await page.goto("/recipes/new");
    await page.getByLabel("Title", { exact: true }).fill("Private stew");
    await page.getByLabel("Servings", { exact: true }).fill("2");
    await page.getByLabel("Ingredients", { exact: true }).fill("1 onion");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Private stew" })).toBeVisible();
    const recipeUrl = page.url();

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    const { id: otherId } = await signInAsNewUser(other);
    try {
      await other.goto(recipeUrl);
      await expect(other.getByRole("heading", { name: "Recipe not found" })).toBeVisible();
    } finally {
      await otherContext.close();
      await deleteUser(otherId);
    }
  });

  test("import a recipe from a URL", async ({ page }) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(SOUP_PAGE);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/soup`;

    try {
      await page.goto("/recipes/new");
      await page.getByLabel("Recipe URL").fill(url);
      await page.getByRole("button", { name: "Import", exact: true }).click();

      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Tomato Soup");
      await expect(page.getByLabel("Servings", { exact: true })).toHaveValue("4");
      await expect(page.getByLabel("Ingredients", { exact: true })).toHaveValue("2 tbsp olive oil\n1 (28 oz) can crushed tomatoes");
      await expect(page.getByLabel("Tags", { exact: true })).toHaveValue("soup, dinner");

      await page.getByRole("button", { name: "Save recipe" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Tomato Soup" })).toBeVisible();
      await expect(page.getByRole("link", { name: /View original/ })).toHaveAttribute("href", url);
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 4: Run the end-to-end tests**

Stop any running `pnpm dev`, then run: `pnpm test:e2e`
Expected: PASS (6 tests). If `generateLink` plus `type=email` fails verification with your CLI version, change the confirm URL in `helpers.ts` to `type=magiclink`. That's a test-only change: the app's `/auth/confirm` passes `type` through unchanged.

- [ ] **Step 5: Document setup in the README**

Replace the body of `README.md` with:

````markdown
# Foodini

Recipes, weekly meal plans and grocery lists. See `docs/superpowers/specs/` for the design.

## Local development

Requires Node 22, pnpm and Docker.

```bash
pnpm install
pnpm exec supabase start        # local Postgres, Auth, Storage, Mailpit
cp .env.example .env.local      # then fill in keys from `pnpm exec supabase status` and your email in ALLOWED_EMAILS
pnpm db:migrate
pnpm dev
```

Sign-in emails arrive in Mailpit at http://127.0.0.1:54324.
After `pnpm exec supabase db reset`, run `pnpm db:migrate` again.

## Tests

```bash
pnpm test        # unit tests (lib/)
pnpm test:int    # database + row-level security (needs local Supabase)
pnpm test:e2e    # Playwright (needs local Supabase; stop `pnpm dev` first)
```

## Deploying

1. Create a Supabase project. Set `DATABASE_URL` to its connection string (transaction pooler), then run `pnpm db:migrate`.
2. In Auth → URL Configuration, set the Site URL to your domain and add `https://<your-domain>/**` to the redirect URLs.
3. In Auth → Email Templates, set both **Magic Link** and **Confirm signup** to the body of `supabase/templates/magic-link.html`.
4. On the host, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `SITE_URL` and `ALLOWED_EMAILS`. Do not set `SUPABASE_SECRET_KEY` or `IMPORT_ALLOW_PRIVATE` in production.
````

- [ ] **Step 6: Final check and commit**

Run: `pnpm lint && pnpm test && pnpm test:int && pnpm build`
Expected: everything passes, and `pnpm build` completes without type errors.

```bash
git add package.json pnpm-lock.yaml .gitignore playwright.config.ts tests/e2e README.md
git commit -m "Add end-to-end tests and setup docs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
