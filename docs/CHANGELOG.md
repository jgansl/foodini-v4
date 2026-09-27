# Changelog

All notable changes to Foodini. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each phase in [ROADMAP.md](ROADMAP.md) is a release.

## [Unreleased]

### Phase 3a, grocery list

#### Added
- **Grocery list** (`/list`, List tab), built from the week's uncooked planned meals:
  - ingredients are scaled to each meal's servings and merged across recipes;
  - amounts are shown in readable units (48 tsp → 1 cup, 1500 ml → 1.5 l) and grouped by store section;
  - unreadable lines are listed under Other.
- **Instant check-offs:** if the plan grows after you've shopped, only the additional amount shows as still needed.
- **Hide an item for the week,** with "Show hidden (n)".
- **Extras:** add your own items, such as "paper towels" or "2 lb apples", to the week's list.
- **`pnpm db:reparse`:** re-parses stored recipes with the current ingredient parser.

#### Fixed
- The ingredient parser reads more containers ("5 lb bag potatoes", "12-ounce bottles beer"), sizes in inches ("9-inch pie crust"), "3 garlic cloves" the same as "3 cloves garlic", and no longer treats "2 cans" as an item called "can".
- Units pluralize correctly after arithmetic ("1 cup", not "1 cups").
- "1-1/2 cups" is read as 1½ cups, not the range 1 to ½.
- "Tea bags", "fish sticks" and "chicken pieces" stay items. Only clove, sprig, head, bunch and slice are read as units after an item name ("garlic cloves", "thyme sprigs").
- Checking a line off keeps keyboard focus on it.

### Phase 2, meal plan

In review as [jgansl/foodini-v4#2](https://github.com/jgansl/foodini-v4/pull/2).

### Added
- **Meal plan** (`/plan`): Monday–Sunday weeks, any number of recipes per day with their own servings (whole or half) and an optional label. Reorder, move to another day, edit, mark cooked, remove.
- **Add to plan** on recipe pages.
- **Plan** tab in the navigation.
- A nudge on uncooked meals from earlier days.
- "Today" follows your own time zone.
- End-to-end tests run beside your own `pnpm dev` (Playwright uses its own build folder).

### Changed
- Deleting a recipe that's in the plan now says how many planned meals it will remove.

### Fixed
- The ingredient parser reads container sizes ("2 14-ounce cans chickpeas", "1 x 400g tin tomatoes"), irregular plurals ("bay leaves", "molasses") and a bare count such as "2 cloves".

## [0.1.0] - 2026-09-27: Phase 1, foundation and recipe box

In review as [jgansl/foodini-v4#1](https://github.com/jgansl/foodini-v4/pull/1).

### Added
- **Sign-in** with an email magic link (Supabase Auth). Only addresses in `ALLOWED_EMAILS` can request a link or keep a session. Entries can be full addresses or whole domains (`@example.com`).
- **Recipe box:**
  - Create, edit and delete recipes.
  - Search by title.
  - Filter by tag.
  - Add notes and a source link.
  - Attach an optional photo (JPEG, PNG or WebP, up to 5 MB, stored privately).
- **Ingredient parsing:** each line is read into quantity, unit and item, with a live preview in the form. Handles fractions (½, 1 1/2), ranges, parenthetical sizes, "to taste" and notes. Lines it can't read are kept as written and flagged.
- **Items:** a per-user item list shared by all recipes. "Eggs" and "egg" are one item. Each item gets a default store section and unit kind.
- **Servings scaler** on the recipe page.
- **Import from a link:** reads schema.org recipe data and fills the form for review before saving.
- **Per-user access** enforced in every query and by row-level security on all tables and on photo storage.
- **Tests:** 167 unit, 18 integration (including row-level security) and 8 Playwright end-to-end tests on a phone viewport.
- **README** covering local setup, tests and deployment.

### Security
- The import fetcher refuses private and loopback addresses, checks again after every redirect, and caps pages at 10 s and 2 MB.
- Sign-in redirects (`?next=`) are limited to same-site paths, including paths with control characters that browsers strip.

### Known issues
See [ROADMAP.md](ROADMAP.md#backlog) for the deferred list. The most noticeable:
- Allrecipes and Serious Eats block the importer (HTTP 403).
- Scaled counts don't re-pluralize ("1 potatoes") and can show fractions ("5 ¼ eggs").
- Importing overwrites fields you've already typed.
