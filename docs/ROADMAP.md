# Roadmap

Foodini is built in five phases. Each is a usable release, and each gets its own implementation plan in `superpowers/plans/` when it starts. The design for all of them is in [superpowers/specs/2026-09-27-foodini-meal-planner-design.md](superpowers/specs/2026-09-27-foodini-meal-planner-design.md).

| # | Phase | Delivers | Status |
|---|---|---|---|
| 1 | Foundation and recipe box | Sign-in, recipes, ingredient parsing, URL import, photos, servings scaler | In review ([jgansl/foodini-v4#1](https://github.com/jgansl/foodini-v4/pull/1)) |
| 2 | Meal plan | Monday–Sunday plan with any number of entries per day, labels, per-entry servings, mark cooked | In review ([jgansl/foodini-v4#2](https://github.com/jgansl/foodini-v4/pull/2)) |
| 3a | Grocery list | List generated from the plan (scaled, merged, readable units, grouped by section), instant check-offs, hide for the week, extras | In review |
| 3b | Offline list | Saved list and queued check-offs in IndexedDB, then a service worker so `/list` opens with no signal (spec §7) | In review |
| 4 | Inventory | On-hand amounts subtracted from the list; checking off adds to inventory; marking a meal cooked deducts from it | In review |
| 5 | Stores and prices | Price log, cost estimates, the list split by store in each store's section order | Next |

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

Known issues and deferred work are GitHub issues labelled [`deferred`](https://github.com/jgansl/foodini-v4/issues?q=is%3Aissue+is%3Aopen+label%3Adeferred) (see AGENTS.md). Issues a later phase depends on carry [`blocks-later-phase`](https://github.com/jgansl/foodini-v4/issues?q=is%3Aissue+is%3Aopen+label%3Ablocks-later-phase). Legal questions carry `legal`.
