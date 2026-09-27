# Licensing

What Foodini's license is, what it covers, what it depends on, and what is still undecided. This is a working record, not legal advice. Have a lawyer review anything commercial or public before launch.

Last reviewed: 2026-09-27.

## Foodini's own license

**Status: proprietary, all rights reserved. No license has been chosen yet.**

- The repository `jgansl/foodini-v4` is private, and `package.json` is marked `"private": true`.
- There is no `LICENSE` file. Without a license, nobody else may copy, modify or redistribute the code, docs or designs.
- A copyright notice is in the [README](../README.md#license).

### What the copyright covers
| Asset | Where | Notes |
|---|---|---|
| Application code | `app/`, `components/`, `server/`, `db/`, `lib/`, `proxy.ts` | The ingredient parser, item normalization and section map (`lib/ingredients.ts`, `lib/units.ts`, `lib/sections.ts`) are the most original code. |
| Design and planning documents | `docs/` (spec, plans, decisions, roadmap) | Protected as written work. The ideas in them (for example the grocery and inventory rules in spec §5–6) are not protected by copyright; keeping the repo private keeps them confidential. |
| Tests and fixtures | `lib/**/*.test.ts`, `tests/` | Import fixtures are hand-written, not copied from real sites. |
| Database migrations and config | `db/migrations/`, `supabase/` | `supabase/config.toml` started from the Supabase CLI template. |

### What a license can't protect
- **Features and ideas.** Anyone can build a meal planner with the same features, as long as they don't copy the code. Patents are the only protection for ideas, and ordinary features like these are unlikely to qualify.
- **The name "Foodini".** That's a trademark question, not a licensing one. See the open decisions below.

## Choosing a license
Pick the row that matches the goal, add the license text as `LICENSE` at the repo root, and update the README and this file. Record the choice in [DECISIONS.md](DECISIONS.md).

| Goal | License | Effect |
|---|---|---|
| Keep it proprietary (current default) | None, or a `LICENSE` stating "All rights reserved" | Nobody may use the code without permission. |
| Show the code but prevent commercial use | PolyForm Noncommercial 1.0.0, or BUSL-1.1 | The code is source-available, but not open source. BUSL converts to an open license after a set date. |
| Open source, and anyone hosting a modified version must share it | AGPL-3.0 | Strong copyleft that also applies to hosted services. |
| Open source, permissive | Apache-2.0 or MIT | Anyone may reuse the code, including commercially. Apache-2.0 adds an explicit patent grant. |

## Dependencies
Production dependencies were checked with `pnpm licenses list --prod` on 2026-09-27: 76 packages.

| License | Packages | Obligation |
|---|---|---|
| MIT | 57 | Keep the copyright notice when redistributing. |
| Apache-2.0 | 9 | Keep the notices; includes a patent grant. |
| ISC | 5 | Like MIT. |
| BSD-3-Clause | 1 | Like MIT, and the authors' names can't be used to endorse the product. |
| 0BSD, Unlicense | 1 each | None. |
| LGPL-3.0-or-later | 1: `@img/sharp-libvips` (the native image library behind `sharp`, which Next.js uses) | No obligation for a hosted web app. If Foodini were ever distributed as a binary or desktop app, users must be able to replace libvips. |
| CC-BY-4.0 | 1: `caniuse-lite` (browser-support data used by the build tools) | Attribution, if the data itself is redistributed. The built app doesn't redistribute it. |

**Conclusion:** no dependency requires Foodini to publish its code or adopt a particular license.

Development-only tools (Vitest, Playwright, drizzle-kit, the Supabase CLI, ESLint, TypeScript) aren't shipped with the app. They are MIT or Apache-2.0 licensed.

### Services
The hosted services (Supabase, and whichever platform the app is deployed to) are governed by their terms of service, not by package licenses. Review them before launching publicly.

## Third-party content
- **Imported recipes.** Instructions, descriptions and photos on recipe websites are their publishers' copyright. Plain ingredient lists and cooking facts generally aren't protected in the US. Foodini keeps imports private to the user who imported them, with a link back to the source. Features that would publish or share imported content need review first (see [AGENTS.md](../AGENTS.md) and roadmap items F3 and F5).
- **Importing is on request only.** The importer fetches one page the user asked for. It doesn't crawl, bulk-download or get around blocks, and some sites (for example Allrecipes and Serious Eats) refuse it.
- **User photos** belong to whoever uploaded them.

## How this stays current
The rules in [AGENTS.md](../AGENTS.md) ("Legal and licensing") apply to every change:
- check the license of every new dependency;
- run `pnpm licenses list --prod` before each PR and call out anything that changed;
- don't copy code whose license is incompatible or unknown;
- log open legal questions in the Legal backlog of [ROADMAP.md](ROADMAP.md).

Update this file when a dependency's license changes, when a license is chosen, or when a new kind of third-party content enters the app.

## Open decisions
These are tracked in the Legal backlog of [ROADMAP.md](ROADMAP.md):
1. **Choose a project license** (see the table above). Until then, all rights are reserved.
2. **Trademark check on "Foodini".** Natural Machines sells a Foodini 3D food printer. Search the USPTO and EUIPO registers before public launch or branding.
3. **Public features (F3 restaurant menus, F5 blog)** need terms of use, a privacy policy, image credits and a content-sourcing decision before launch.
