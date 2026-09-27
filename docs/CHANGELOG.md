# Changelog

All notable changes to Foodini. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each phase in [ROADMAP.md](ROADMAP.md) is a release.

## [Unreleased]

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
