# Decisions

A log of decisions that shaped Foodini, newest last. Each entry records what was chosen, why, and what it costs. The full design is in [superpowers/specs/2026-09-27-foodini-meal-planner-design.md](superpowers/specs/2026-09-27-foodini-meal-planner-design.md).

## 2026-09-27

### D1. A meal planner, built in five phases
Recipes → meal plan → grocery list → inventory → prices and stores. Each phase gets its own plan and is a usable release on its own.
**Why:** all five together were too large for one spec.
**Cost:** later phases may refine earlier ones, but the data model was designed for all five up front to avoid rework.

### D2. Single user, synced across devices
Sign-in is required and data lives in a hosted database.
**Why:** a grocery list you can't open on your phone at the store loses most of its value.
**Cost:** needs a hosted backend instead of browser storage.

### D3. Stack: Next.js 16, Supabase, Drizzle
Supabase provides Postgres, Auth and Storage. Drizzle provides a typed schema and migrations in the repo. Next Server Actions handle writes.
**Why:** the fewest moving parts. Alternatives were Neon + Better Auth + Vercel Blob (three services) and local-first sync (awkward relational queries).
**Cost:** tied to Supabase for auth and storage; the data is plain Postgres and stays portable.

### D4. One shared `items` table
Recipe ingredients, and later grocery lines, inventory and prices, all point at one per-user item. Items are matched on a normalized `key`: lowercase, punctuation removed, last word singularized.
**Why:** merging quantities, subtracting inventory and looking up prices all need the same identity for "flour".
**Cost:** singularization is heuristic ("molasses" → "molass"). The key is only for matching, so consistency matters more than spelling.

### D5. Quantities stored as entered
"2 cup" is stored as written, and the original line is always kept. Conversion to base units (ml, g, count) happens only when values are compared or summed, and only within the same kind of measure.
**Why:** recipes show what you typed while the maths stays exact. Converting volume to weight would need ingredient densities.
**Cost:** a recipe in grams and an inventory in cups won't subtract; the grocery list shows both instead (phase 3).

### D6. Access control in queries and in the database
Drizzle connects as the `postgres` role, which bypasses row-level security. So every query helper takes the user's id and filters by it, and every Server Action calls `requireUser()`. Row-level security separately protects Supabase's public Data API.
**Why:** a typed ORM with ordinary SQL, while the publicly visible publishable key still can't read anyone's rows.
**Cost:** a query helper that forgets its `user_id` filter isn't caught by the database. Integration tests check cross-user access.

### D7. Email magic link with an allowlist
Sign-in uses Supabase's magic link through a `token_hash` email template and `/auth/confirm`. `ALLOWED_EMAILS` is checked when a link is requested and again on every session (`getUser`). Deployments should also turn off public sign-ups in Supabase.
**Why:** a public URL shouldn't give strangers a working account. The review found that a request-only check could be bypassed by calling Supabase Auth directly.
**Cost:** the allowlist lives in an environment variable. `@domain` entries exist for tests, and a careless one could admit a whole domain.

### D8. Import from structured data only, fetched safely
Import reads schema.org `Recipe` JSON-LD, then fills the form without saving. The server-side fetcher allows only http(s), refuses private and loopback IPs (re-checked after every redirect), and caps pages at 10 s and 2 MB. `IMPORT_ALLOW_PRIVATE=1` works in development only.
**Why:** most recipe sites publish JSON-LD, and a server that fetches user-supplied URLs is an SSRF risk.
**Cost:**
- Sites without JSON-LD import only a title.
- Some large sites return 403 to the importer.
- DNS rebinding between our lookup and the fetch remains a documented residual risk.

### D9. Private photos with signed URLs
Photos are stored under `<user_id>/<recipe_id>/`, served through signed URLs that last one hour, and shown with plain `<img>` instead of `next/image`. The browser checks size and type before upload because Next rejects bodies over 6 MB before the action runs.
**Why:** privacy, and not having to configure image hosts for each environment.
**Cost:** no automatic image optimization.

### D10. No `use cache`
Every page renders per request.
**Why:** all data is per-user and changes often.
**Cost:** there's no caching to speed pages up if they ever need it.

### D11. Testing approach
- Vitest unit tests cover the pure `lib/` modules.
- Integration tests run against a local Supabase. The row-level security test was proven by switching the protection off and watching it fail.
- Playwright end-to-end tests run on a phone viewport.
- Import tests use hand-written HTML that reproduces the JSON-LD shapes real sites use, instead of copies of other sites' pages.

**Cost:** unusual real-world page shapes may still slip through.

### D12. Tooling details
- The Vitest config is `vitest.config.mts`, which avoids Vite's warning about CommonJS configs.
- `@types/node` stays at 20 even though Vitest's peer range asks for 22. The runtime is Node 22 and everything passes.
- The Zod coerced number is typed as `z.coerce.number<string>()` so the servings schema type-checks.

### D13. Plan dates are calendar strings; "today" comes from the browser's time zone
`plan_entries.date` is a Postgres `date` handled as `YYYY-MM-DD`, with all date math in UTC. The browser saves its IANA time zone in a `tz` cookie, and the server computes "today" in that zone, falling back to UTC.
**Why:** a planned day is a calendar day, not an instant, and servers run in UTC.
**Cost:** a request sent before the cookie exists uses UTC. The server passes the time zone it actually rendered with to `<TimezoneCookie>`, which refreshes the page once if the browser's zone gives a different date. The first version compared against UTC only when it wrote the cookie, and missed requests that were already in flight; that was fixed in phase 3b.

### D14. Planned recipes can't be deleted silently
The foreign key from `plan_entries.recipe_id` is `NO ACTION`, which blocks the delete but still lets a deleted user's rows cascade. `deleteRecipe` reports `{ status: "planned", count }` unless the caller asks to remove the plan entries, and the UI confirms with the count. The plan's row-level security policy also requires the recipe to belong to the same user.
**Why:** spec §3, without the cascade-order failure that `RESTRICT` causes.
**Cost:** a meal planned in another tab between page load and delete leads to a second confirmation.

### D15. Plan edits are plain form submissions
Plan changes re-render the page after each Server Action. `useOptimistic` is kept for phase 3's check-offs, where speed matters most.
**Why:** simpler, and it works before JavaScript loads.
**Cost:** each plan change waits for a server round trip.

### D16. End-to-end tests use their own build folder
`next.config.ts` reads `distDir` from `NEXT_DIST_DIR`, and Playwright sets it to `.next-e2e`. Next adds matching type paths to `tsconfig.json`, which are committed.
**Why:** Next allows one dev server per build folder, so the tests can now run while you use `pnpm dev`.
**Cost:** a second build cache on disk.

### D17. Grocery line keys include the count unit
A line's key is `item:<id>:<unitKey>`, where `unitKey` is `volume`, `weight` or `count:<unit|each>`. Unparsed lines use `raw:<text>`, and extras use `extra:<id>`.
**Why:** "1 can tomatoes" and "3 tomatoes" can't be added together; spec §3's `(item, unit_kind)` key would merge them into a wrong total.
**Cost:** the same item can appear on two count lines ("1 can", "3").

### D18. Before inventory, a checked amount means "bought this week"
Until phase 4, `shortfall = required − checked_qty` for the line's mark. Phase 4 replaces this with inventory, and checking off adds to inventory instead; the result is the same.
**Why:** it gives the spec's "plan grows after shopping" behavior now.
**Cost:** phase 4 must migrate checked marks into inventory, or start the current week fresh.

### D19. Readable grocery units follow the recipes' system
A merged line is shown in metric if any contributing ingredient used a metric unit, otherwise in US units, using fixed ladders: tsp, tbsp, cup; oz, lb; ml, l; g, kg. Unit labels pluralize with the same tolerance `formatQuantity` rounds with.
**Why:** predictable output without per-user settings.
**Cost:** a mostly-US week with one metric recipe shows that item in metric.

### D20. Offline support is its own plan (phase 3b)
**Why:** the IndexedDB queue and service worker carry different risks, and spec §7 lets them slip.
**Cost:** the list needs a connection until 3b ships.

### D21. Re-parsing stored recipes is a maintenance script
`pnpm db:reparse` re-parses every stored ingredient line with the current parser and deletes items nothing uses. It runs through `tsx` with the `react-server` condition, so the `server-only` modules load.
**Why:** parser fixes otherwise only apply to recipes saved afterwards.
**Cost:** run it deliberately after parser changes. It rewrites `recipe_ingredients` rows, keeping their raw text and order. It orphans this week's grocery marks for items whose key changed. Its unused-item delete must learn about inventory and prices before phase 4.

### D22. Our own offline queue, not Next's `experimental.useOffline`
Check-offs go to an IndexedDB queue and a JSON sync endpoint (`POST /api/grocery/sync`), and a service worker serves `/list` when offline.
**Why:** Next's flag retries failed navigations and Server Actions from memory only, so a reload loses them, and it's experimental. Spec §7 needs changes that survive reloads and a cold offline open.
**Cost:** more code: a queue, a store, an endpoint and a service worker.

### D23. Offline sync is last-write-wins on the device's clock, and the server still computes amounts
A change carries `{ kind, week, key or id, checked, at }` and is skipped if its `at` is older than the row's `updated_at`. The client never sends a quantity: the server records the line's shortfall at sync time. The timestamp is the tap's time (`performance.timeOrigin + event.timeStamp`).
**Why:** spec §7's conflict rule, and D18's rule that amounts come from the server.
**Cost:** devices with badly wrong clocks can win or lose unexpectedly (`at` is limited to the last 30 days and 5 minutes into the future). A plan changed while offline is reflected in the amount recorded at sync time.

### D24. The service worker caches only static assets and the /list page
`/_next/static/*` is served cache-first, and `/list` navigations network-first. It's registered in production only and tested against a production build (`pnpm test:e2e:sw`).
**Why:** the smallest service worker that meets spec §7, with no risk of serving stale pages elsewhere in the app.
**Cost:** the list opens offline only after one online visit under the service worker's control, and other pages still need a connection.

### D25. CI checks lint, unit tests and the build; database suites run locally
GitHub Actions runs `pnpm lint`, `pnpm test` and `pnpm build` on every push and pull request, with placeholder environment variables. The integration, e2e and service-worker suites need a Supabase stack and run locally for now.
**Why:** fast, dependable feedback on every PR without secrets or a database in CI.
**Cost:** database regressions are caught only by running the local suites; adding `supabase start` to CI is in the backlog.

