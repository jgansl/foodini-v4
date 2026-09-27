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

## Future features
These aren't scheduled into a phase yet. Each gets a spec section and a plan before it's built.

### F1. Recipe sources list
A per-user list of the external websites your recipes come from. It's the groundwork for suggestions (F2) and restaurant menus (F3).
- **Added automatically:** saving a recipe with a source URL (imported or typed) records that site, keyed by hostname with `www.` removed. A site you use again gains another recipe; it's never duplicated.
- **Added manually:** a "Sources" page where you can add a site you like without importing anything, then rename, remove or open it.
- **Shows:** site name (from the page's `og:site_name` or `<title>`, falling back to the hostname), URL, how it was added (import, recipe or manual), number of recipes, and when it was first and last used.
- **Data (sketch):** `sources` (id, user_id, host, url, name, kind `'recipe_site' | 'restaurant'`, added_via `'import' | 'recipe' | 'manual'`, created_at, last_used_at), unique on (user_id, host). Add `recipes.source_id` next to the existing `source_url`. Backfill from the `source_url` of existing recipes. Uses row-level security and `user_id` filtering like every other table (docs/DECISIONS.md D6).
- **Depends on:** phase 1 only, so it can be built alongside or after phase 2.

### F2. Recipe suggestions
Suggest new recipes using your sources (F1), what you plan and cook (phases 2 and 4), and what's on hand (phase 4).
- The approach is open: suggest recipes from your saved sites, rank your own recipes by what's in inventory, or use an LLM to propose ideas. Decide it in a spec section, and record the choice in DECISIONS.md.
- Needs phases 2–4 to be useful. Plan it after phase 4.

### F3. Restaurant menus
Add restaurants as a kind of source (`kind = 'restaurant'`) and use their menus as inspiration for suggestions ("make it at home").
- **Legal gate:** menu text and photos are the restaurant's copyright, and many sites forbid scraping. Resolve the Legal backlog item below before building this.

### F4. Cooking lessons
Step-by-step lessons on techniques (knife skills, sauces, bread, and so on) linked to the recipes that use them.
- **Shape (open):** a lesson has steps, optional photos or video, and linked recipes. Track completed lessons so suggestions (F2) can favor recipes that practice a new skill.
- **Content source (open):** your own lessons, or curated links to outside videos and articles. Linking out avoids hosting and copyright questions; hosting your own video needs storage and bandwidth planning (Supabase Storage limits, or a video host).
- **Spec impact:** lessons you write for yourself fit the single-user app. Lessons for other people change the audience assumption (see F5).

### F5. Culinary blog
Public posts about cooking, recipes and what you've been making.
- **Spec impact:** this is the first public, signed-out part of Foodini. It needs public routes that the sign-in proxy allows through, SEO (metadata, sitemap, Open Graph), and a clear line between public posts and your private recipe box, which stays private.
- **Authoring (open):** Markdown/MDX in the repo, a table in Supabase with an editor page, or a headless CMS such as Sanity. Decide it in a spec section and record the choice in DECISIONS.md.
- **Recipes in posts:** you can publish recipes you wrote. Recipes imported from other sites can only be linked and credited, never republished (see the Legal backlog).
- **Legal gate:** resolve the project license and the "Foodini" trademark check before launching anything public (see the Legal backlog).

### F6. Recipe history and variations
Keep every saved version of a recipe, and let a recipe branch into variations: "Pizza dough" → "Thick crust", "Thin crust", "Whole wheat".
- **History:** each save stores an immutable snapshot (title, servings, ingredient lines, steps, notes) with a timestamp and an optional note ("less salt"). You can view past versions, compare two, and restore one (restoring saves a new version rather than rewriting history).
- **Variations:** "Make a variation" copies the current recipe into a new recipe linked to its parent (`recipes.parent_id`, `variation_name`). Variations diverge freely, get their own history, and are listed together on the base recipe's page. The alternative is storing a variation as overrides on its base: less duplication, but much more complex. Decide in a spec section.
- **Data (sketch):** `recipe_versions` (id, user_id, recipe_id, version, snapshot jsonb, note, created_at), plus `recipes.parent_id` and `recipes.variation_name`.
- **Fits the plan and grocery design:** a variation is an ordinary recipe row, so plan entries and grocery lines reference the exact variation you're cooking, with no change to phases 2–5.
- **Depends on:** phase 1. It needs a short design pass (brainstorm and spec section) before planning.

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

- The importer doesn't decode `&ntilde;` and most other named HTML entities: an imported step reads "jalape&ntilde;o". Decode the full HTML5 named-entity set, or at least accented Latin letters (`lib/import.ts`), and backfill already-imported recipes.
- The importer only reads JSON-LD. Pages that mark recipes up with schema.org Microdata (`itemprop="recipeIngredient"`) import only a title. Add a Microdata fallback (`lib/import.ts`).

**Photos**
- If the database write fails after an upload, the uploaded photo is left in storage.
- If a recipe is deleted while being edited, saving orphans the new photo.

**Legal**
- Choose a project license. There is none yet, so all rights are reserved. The options (proprietary, source-available, AGPL, permissive) are listed in the phase 1 discussion; add `LICENSE` and a README copyright line once chosen.
- Trademark check on "Foodini": Natural Machines sells a Foodini 3D food printer. Search the USPTO and EUIPO registers before any public launch or branding.
- Imported recipe text and photos are third-party copyright. They're fine in a private recipe box, but any sharing or publishing feature needs review first.
- `sharp` pulls in libvips under LGPL-3.0. That's fine for a hosted app; revisit if Foodini is ever distributed as a binary or desktop build.

- Sources, suggestions and menus (F1–F3):
  - F1 only stores hostnames and titles, which is low risk.
  - F2 must not fetch or crawl sites in bulk to find recipes without the approval that AGENTS.md requires.
  - F3 needs a decision on where menu data comes from (restaurant-provided, a licensed API, or user-entered) and how it's displayed. Only link out to menus unless there is permission to copy them.

- Lessons and blog (F4–F5):
  - Publishing is the first time Foodini content leaves your private account. Before launching, you need a terms-of-use and privacy page, and image credits.
  - Affiliate links or ads need a disclosure.
  - If comments are added, they need moderation and a privacy note.
  - Only content you own, or have permission to use, may be published.

**Infrastructure**
- No CI yet. Lint, unit tests and the build could run on GitHub Actions; integration and end-to-end tests need Supabase in Docker.
