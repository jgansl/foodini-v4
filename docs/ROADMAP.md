# Roadmap

Foodini is built in five phases. Each is a usable release, and each gets its own implementation plan in `superpowers/plans/` when it starts. The design for all of them is in [superpowers/specs/2026-09-27-foodini-meal-planner-design.md](superpowers/specs/2026-09-27-foodini-meal-planner-design.md).

| # | Phase | Delivers | Status |
|---|---|---|---|
| 1 | Foundation and recipe box | Sign-in, recipes, ingredient parsing, URL import, photos, servings scaler | In review ([jgansl/foodini-v4#1](https://github.com/jgansl/foodini-v4/pull/1)) |
| 2 | Meal plan | Monday–Sunday plan with any number of entries per day, labels, per-entry servings, mark cooked | Next |
| 3 | Grocery list and offline | List generated from the plan (scaled, merged, grouped by section), manual extras, hide items, check off, offline queue, then a service worker | Planned |
| 4 | Inventory | On-hand amounts subtracted from the list; checking off adds to inventory; marking a meal cooked deducts from it | Planned |
| 5 | Stores and prices | Price log, cost estimates, the list split by store in each store's section order | Planned |

## Phase notes
- **Phase 2** creates `plan_entries`. Deleting a recipe that is still planned must then be blocked (spec §3), and the recipe page gains "Add to plan".
- **Phase 3** extends `lib/units.ts` with base-unit conversion and readable output units, and adds `lib/grocery.ts` (spec §5). Offline support comes last in the phase, with the service worker as its final task (spec §7).
- **Phase 4** adds `lib/inventory.ts`, including the exact buy → cook → uncook → uncheck round trip (spec §5).
- **Phase 5** adds `stores`, `store_sections`, `price_records` and `items.preferred_store_id` (spec §6).

## Backlog
Known issues deferred from phase 1's final review. Before phase 3, fix the parser items marked ★, because grocery merging depends on clean item keys.

**Parser and display**
- ★ "2 14-ounce cans chickpeas" and "1 x 400g tin tomatoes" produce junk item names.
- ★ Irregular plurals: "bay leaves" → "bay leave" (misses the "bay leaf" keyword), "molasses" → "molass".
- ★ "2 cloves" (the spice) is read as the unit "clove" with no item.
- Scaled counts don't re-pluralize ("1 potatoes", "2 egg (large)") and can show fractions ("5 ¼ eggs").
- Litres are labelled lowercase "l".
- Scaled ranges use only the upper number.

**Import**
- Allrecipes and Serious Eats return 403 to the `FoodiniRecipeImporter/1.0` user agent.
- Importing overwrites fields you've already typed. It should fill only empty fields, or ask first.
- Pages are always decoded as UTF-8, so Latin-1 pages mangle characters like ½.
- `isPrivateAddress` misses a few rare IPv6 ranges: `::7f00:1`, `64:ff9b::/96`, `2002::/16`, `fec0::/10`.

**Photos**
- If the database write fails after an upload, the uploaded photo is left in storage.
- If a recipe is deleted while being edited, saving orphans the new photo.

**Legal**
- Choose a project license. There is none yet, so all rights are reserved. The options (proprietary, source-available, AGPL, permissive) are listed in the phase 1 discussion; add `LICENSE` and a README copyright line once chosen.
- Trademark check on "Foodini": Natural Machines sells a Foodini 3D food printer. Search the USPTO and EUIPO registers before any public launch or branding.
- Imported recipe text and photos are third-party copyright. They're fine in a private recipe box, but any sharing or publishing feature needs review first.
- `sharp` pulls in libvips under LGPL-3.0. That's fine for a hosted app; revisit if Foodini is ever distributed as a binary or desktop build.

**Infrastructure**
- No CI yet. Lint, unit tests and the build could run on GitHub Actions; integration and end-to-end tests need Supabase in Docker.
