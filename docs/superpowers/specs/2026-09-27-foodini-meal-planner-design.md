# Foodini — Meal Planner Design

Date: 2026-09-27
Status: Approved. Phase 1 is implemented ([jgansl/foodini-v4#1](https://github.com/jgansl/foodini-v4/pull/1)); phases 2–5 are planned in `docs/ROADMAP.md`. Decisions made during implementation are logged in `docs/DECISIONS.md`.

## 1. Purpose

A personal meal-planning web app: keep recipes, plan the week, shop from a generated grocery list, track what's on hand, and see prices and which store to buy each item at.

### Brief

**Stated by the user**
- Purpose: meal planning — recipes → weekly plan → grocery list → inventory → prices & stores.
- Users: a single user, synced across devices (sign-in required).
- Recipes: manual entry plus import from a URL; ingredients are structured (quantity, unit, item).
- Plan: flexible — any number of entries per day, each with an optional label and its own servings; recipes scale to those servings.
- Grocery list: generated from the plan, plus manual extras, hide items, checked state saved per week, grouped by section.
- Inventory: on-hand quantities subtract from the list; checking an item off adds it to inventory; marking a meal cooked deducts its ingredients.
- Prices: price history per item and store, cost estimates, list split by store and then by section.
- Delivery: in phases, in the order above.
- Stack: Supabase (Postgres, Auth, Storage) + Drizzle ORM, on the existing Next.js 16 / React 19 / Tailwind 4 scaffold.

**Assumed (confirmed with the user)**
- Mobile-friendly web app; no native app.
- Units convert within the same kind of measure (volume ↔ volume, weight ↔ weight, count); across kinds, never.
- Weeks run Monday–Sunday.
- One currency; money is stored in integer cents.

### Success criteria
- The user can go from "paste a recipe URL" to "checked-off grocery list at the store on a phone" without typing any ingredient by hand.
- Grocery quantities are correct: scaled, merged across recipes, net of inventory, in readable units.
- The inventory round trip is exact: buy → cook → uncook → uncheck returns inventory to its starting state.
- Checking off items keeps working in a store with no signal (once the list page has been opened).

### Out of scope
Multiple users or households, native apps, nutrition data, recipe versioning, pack-size modeling, converting between volume and weight, expiration dates, and recipe discovery or catalog APIs.

## 2. Architecture

- **Next.js 16 App Router.** Conventions from the bundled docs: `proxy.ts` (formerly middleware), and caching is opt-in through `use cache`. All data is per user and changes often, so pages render per request and **nothing uses `use cache`**.
- **Reads:** Server Components query Postgres through Drizzle.
- **Writes:** Server Actions (`app/**/actions.ts`) validate with Zod, write through Drizzle, then call `revalidatePath`. Forms work before client JavaScript loads (progressive enhancement); `useOptimistic` is used for check-offs and reordering.
- **Auth:** Supabase Auth (email magic link) using `@supabase/ssr` cookies. Only addresses in `ALLOWED_EMAILS` (full addresses or `@domain` entries) can request a link, and sessions for any other address are treated as signed out. `proxy.ts` refreshes the session and redirects signed-out visitors to `/login`, and is only an optimistic first check. Authorization is enforced in every action and query (user id from the verified session) **and** by row-level security on every table.
- **Storage:** recipe photos go in a Supabase Storage bucket, under a per-user path prefix, with storage policies.
- **Domain logic lives in pure TypeScript modules in `lib/`**, with no Next.js or database imports, so each can be unit-tested on its own:

| Module | Responsibility |
|---|---|
| `lib/units.ts` | Unit parsing and aliases, conversion to base units (ml, g, count), choosing a readable output unit |
| `lib/ingredients.ts` | Parse an ingredient line → `{ qty?, unit?, name?, note?, raw }` |
| `lib/sections.ts` | Keyword map from item name to default store section |
| `lib/import.ts` | Page HTML → recipe draft (schema.org `Recipe` JSON-LD) |
| `lib/grocery.ts` | Plan entries, recipes, extras, marks and inventory → grocery lines (§5) |
| `lib/inventory.ts` | Compute deductions for a cooked entry; apply and reverse (§5) |
| `lib/pricing.ts` | Price records → unit prices, store choice, totals (§6) |

- **Database access** lives in `db/` (Drizzle schema, migrations, query helpers). Pages and actions call query helpers, and query helpers call the `lib/` functions.

## 3. Data model

Every table has a `user_id uuid not null` column referencing `auth.users`, and row-level security policies of the form `user_id = auth.uid()` for select, insert, update and delete. Timestamps are `timestamptz`.

```
items              id, user_id, name, key, section, unit_kind ('count'|'volume'|'weight'),
                   preferred_store_id? (phase 5)
                   unique (user_id, key); key = normalized name (see Rules)

recipes            id, user_id, title, servings (int > 0), steps text[], tags text[],
                   source_url?, image_path?, notes?, created_at, updated_at
recipe_ingredients id, user_id, recipe_id → recipes (cascade), position, raw_text,
                   item_id? → items, quantity? numeric, unit?, note?

plan_entries       id, user_id, date, position, recipe_id → recipes (restrict),
                   servings (numeric > 0), label?, cooked_at?, deducted jsonb?

grocery_extras     id, user_id, week_start (date, Monday), item_id?, name, quantity?, unit?,
                   checked bool, checked_qty?
grocery_marks      user_id, week_start, key, checked, checked_qty?, hidden
                   pk (user_id, week_start, key)
                   key = 'item:<item_id>:<unit_kind>' for recognized lines,
                         'raw:<lowercased, whitespace-collapsed raw_text>' for unparsed lines

inventory          user_id, item_id, quantity numeric ≥ 0 (in base unit)   -- phase 4
                   pk (user_id, item_id)

stores             id, user_id, name                                       -- phase 5
store_sections     store_id → stores (cascade), section, sort_order
price_records      id, user_id, item_id, store_id, price_cents int, quantity, unit, recorded_at
```

**Rules**
- **Items** are created on demand the first time an ingredient names them. Matching is case-insensitive and ignores surrounding whitespace, with simple singular/plural folding ("eggs" matches "egg"). The normalized form (lowercase, punctuation removed, whitespace collapsed, last word singularized) is stored as `key`, and `name` keeps the first spelling seen. `unit_kind` is set from the first unit the item is used with; an item first seen with no unit gets `count`.
- **Quantities** are stored as entered (`2`, `cup`) and converted to base units only when compared or summed.
- **`raw_text`** is always kept. The parsed fields may be empty; a line with a recognized item but no quantity ("salt to taste") keeps `item_id` and leaves `quantity` empty.
- **Deleting a recipe that's still planned** is blocked by `restrict`; the UI asks whether to remove its plan entries first.

## 4. Pages

All pages except `/login` require sign-in. Phones come first: a bottom tab bar (Recipes, Plan, List, and Inventory from phase 4) that becomes a sidebar at wider breakpoints.

| Route | Phase | Content |
|---|---|---|
| `/login` | 1 | Email magic link |
| `/recipes` | 1 | List, text search on title, tag filter |
| `/recipes/new` | 1 | Form with an "Import from URL" field at the top |
| `/recipes/[id]` | 1 | View, servings scaler, "Add to plan" (phase 2), cost estimate (phase 5) |
| `/recipes/[id]/edit` | 1 | Same form |
| `/plan?week=YYYY-MM-DD` | 2 | Monday–Sunday; entries per day: add, reorder, set servings and label, mark cooked, remove |
| `/list?week=YYYY-MM-DD` | 3 | Grocery list (§5); grouped by store in phase 5 |
| `/inventory` | 4 | On-hand items with quick editing |
| `/stores` | 5 | Stores, section order, price history per item |

`week` defaults to the current Monday; any date is normalized to its Monday.

### Recipe form
Fields: title, servings, one ingredient line per row (free text, parsed live with a preview of qty / unit / item), steps (one per row), tags, source URL, notes and photo. Lines that can't be parsed are allowed, and are marked so they can be fixed.

### URL import
A Server Action fetches the page on the server: only `http`/`https`, a 10 s timeout, a 2 MB limit, and **addresses that resolve to private or loopback IPs are refused**. It finds the schema.org `Recipe` JSON-LD (including inside an `@graph`), maps it to a draft, and runs each `recipeIngredient` through the parser. The draft **fills in the form without saving**. If no recipe data is found, the app shows "Couldn't find a recipe on that page" and prefills only the title (from `<title>`) and the source URL.

## 5. Grocery list and inventory

### Generating a week's list
1. Take every plan entry dated within the week where `cooked_at` is empty. Past days are included; the plan page nudges "Mark as cooked or remove?" for entries from earlier days.
2. For each ingredient: `scaled = quantity × entry.servings ÷ recipe.servings`.
3. Group by `(item, unit_kind)` and sum in base units. This gives **required**.
4. **Shortfall** = `max(0, required − inventory)` when the inventory is in the same unit kind; otherwise the full required amount, with a hint ("you have 5 cups"). Lines whose shortfall is 0 are left out.
5. Display in a readable unit and group by section (by store and then section from phase 5).
6. Append the week's extras. Apply the hidden marks.

### Special lines
| Case | Behavior |
|---|---|
| Recognized item, no quantity | Listed without an amount. If inventory has any of it, marked "have some" and dimmed (not auto-hidden). |
| No recognized item (unparsed) | Listed under "Other" using the raw text; excluded from inventory and price math; identical raw lines across recipes merge into one line; checked and hidden state uses a `raw:` key. |
| Hidden | Hidden for this week only; inventory is untouched. A "Show hidden (n)" toggle reveals them. |
| Recipe edited after it was planned | The list recomputes from the current recipe; existing marks are kept. |

### Checking off
- **Check:** the mark gets `checked = true, checked_qty = shortfall` (the quantity can be edited before confirming), and inventory is increased by `checked_qty`. Checked lines are **rendered from the mark** ("✓ flour, 3 cups"), not from the shortfall, which is now 0.
- **Uncheck:** inventory is decreased by `checked_qty`, floored at 0, and the mark is cleared.
- **Plan grows after shopping:** a new shortfall shows as an unchecked line for only the additional amount, next to the checked mark.
- **Extras** linked to an item and carrying a quantity update inventory the same way; other extras are just checkboxes.
- Before phase 4 there is no inventory, so the inventory steps are skipped.

### Cooking
- **Mark cooked:** for each scaled ingredient with a recognized item and a matching unit kind, `take = min(scaled, on_hand)`; subtract it, and save `{item_id: take}` in `plan_entries.deducted`. Set `cooked_at`.
- **Mark not cooked:** add `deducted` back, then clear `deducted` and `cooked_at`. The round trip is exact.
- Inventory can always be edited directly on `/inventory`; that is the fix for any drift.

## 6. Prices and stores (phase 5)

- **Recording:** a "Shopping at" store picker on the list page (remembered per week in `localStorage`). Checking a line off opens an optional price field, prefilled with the last price for that item at that store. Saving creates a `price_records` row. Skipping is one tap.
- **Unit price** = `price_cents ÷ quantity in base units`. Records whose unit kind doesn't match the item are kept in the history but excluded from comparisons.
- **Choosing a store per line:** (1) `items.preferred_store_id`; else (2) the lowest unit price among each store's latest record from the last 90 days; else (3) "Any store". Each line has a menu to move it for this week only, plus "Always buy here", which sets the preferred store.
- **Layout:** grouped by store → store section order (`store_sections`; unordered sections go last, in the default order) → item name. The current "Shopping at" store is pinned first.
- **Estimates:** line = shortfall × unit price at the chosen store; totals per store and overall, shown as "~$84 · 6 items unpriced" (missing prices are never counted as $0); recipe cost per batch and per serving, using the cheapest known unit prices; the plan header shows the week total.
- **Known limitation:** unit prices favor bulk stores; the preferred store is the override. Pack sizes are not modeled.

## 7. Offline grocery list (phase 3)

- The list page keeps the last list it got from the server in IndexedDB and shows it immediately, then refreshes.
- Check/uncheck updates the screen immediately and adds a change to a queue in IndexedDB. Each change sends the **final state**, `{week_start, key, checked, checked_qty, at}`. Sending the same change twice is harmless; conflicts between devices resolve to the latest `at`.
- The queue is sent on the `online` and `focus` events, and on load. A badge shows the number of pending changes. A change the server rejects is dropped and reported with a message.
- **The last task of phase 3** is a small service worker that caches `/list` and its static assets, so the page can open cold with no signal. It's isolated so that it can slip without blocking the rest of phase 3.

## 8. Error handling

- Server Actions return `{ ok: true, data? } | { ok: false, fieldErrors?, message? }`. Forms show the errors next to each field and never lose your input.
- An `error.tsx` boundary per route segment shows a retry. An expired session redirects to `/login?next=…`.
- Destructive actions confirm first and say what they affect (for example, "Remove from 3 planned meals?").
- Import failures are described in §4.

## 9. Testing

- **Vitest** unit tests for all of `lib/`: unit conversion and output-unit choice; the ingredient parser (fractions, unicode fractions like ½, ranges, "to taste", notes after commas); import against hand-written HTML fixtures that reproduce the JSON-LD shapes real sites use (plain object, `@graph`, top-level array, `HowToSection`, HTML instruction strings); table-driven grocery tests covering every row in §5, plus the buy → cook → uncook → uncheck round trip; pricing covering the store-choice order, the 90-day window, mismatched units and totals with unpriced items.
- **Playwright** end-to-end tests, one or two per phase, run against a local Supabase from the `supabase` CLI (requires Docker).
- **Row-level security test:** a second user can't read or write the first user's rows.

## 10. Phases

| # | Scope | Result |
|---|---|---|
| 1 | Foundation (Supabase project, auth, Drizzle schema and migrations, row-level security, app shell) and recipes (CRUD, parser, URL import, photos) | You can sign in and build your recipe box |
| 2 | Meal plan | You can plan a week |
| 3 | Grocery list, then offline support | You can shop from it |
| 4 | Inventory | The list accounts for what you already have |
| 5 | Stores and prices | You see costs and a list split by store |

Each phase gets its own implementation plan when it starts. Tables are created in the phase that first needs them. Phase 1 creates `items`, `recipes` and `recipe_ingredients`.
