# Phase 3b: Offline Grocery List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The grocery list keeps working in a store with no signal:
- The list page shows the last list saved on the device straight away.
- A check-off is saved on the device first (in an IndexedDB queue) and synced when the connection returns, or on focus or load.
- A badge shows how many changes are waiting to sync.
- Between devices, the newest change wins.
- A service worker lets `/list` open cold with no signal.

This also fixes the phase 3a backlog item "a check-off can be lost if you reload within a second".

**Architecture:**
- **Pure queue logic** in `lib/offline-queue.ts`: change types, coalescing, applying pending changes to the list, and validating a sync request. It has unit tests.
- **A JSON route handler,** `POST /api/grocery/sync`, applies a batch of changes with last-write-wins. It compares each change's `at` with the row's `updated_at`, and the server still computes amounts, following phase 3a's rule.
- **A small IndexedDB store** holds the list snapshot and the queue, keyed per user.
- **The list component** now shows server data, or a newer snapshot, with pending changes applied on top.
- **A hand-written `public/sw.js`:**
  - `/_next/static/*` is served cache-first;
  - navigations to `/list` go to the network first and fall back to the cache;
  - it's registered in production only.

**Tech Stack:** as before. **No new dependencies.** IndexedDB and the service worker use browser APIs directly.

**Spec:** `docs/superpowers/specs/2026-09-27-foodini-meal-planner-design.md`, §7, plus §8 for errors. Phase 3a's plan (`2026-09-27-phase-3a-grocery-list.md`) and D17–D21 describe the list this builds on.

## Global Constraints

- All earlier Global Constraints still apply:
  - Next 16 conventions, no `use cache`, `requireUser`/`getUser` on every server entry point, and `userId` filtering in every query.
  - `pnpm`, and the commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - AGENTS.md rules: deferred work goes in the ROADMAP Backlog; check licenses.
- **Don't use Next's `experimental.useOffline`.** It retries failed navigations and Server Actions from memory only. The spec needs a queue that survives reloads and a list that opens cold, and the flag is experimental. Record this as D22 (Task 6).
- **A queued change** is `{ kind: "line", week, key, checked, at }` or `{ kind: "extra", week, id, checked, at }`, where `at` is epoch milliseconds from the device.
  - This differs from the spec, which includes `checked_qty`: the server computes the amount when it applies a check (phase 3a Global Constraints and D18), so the client never sends quantities.
  - Changes are coalesced per target: a newer change to the same line or extra replaces the older one in the queue.
- **Last write wins:** a change is applied only if its `at` isn't older than the row's `updated_at`.
  - Line changes compare against `grocery_marks.updated_at`.
  - Extra changes compare against a new `grocery_extras.updated_at` column.
  - Applying a change sets `updated_at = at`.
  - Hide and unhide don't touch `updated_at` for existing rows.
- **Sync results** are `ok`, `stale` or `invalid` per change.
  - `ok` and `stale` changes leave the queue silently.
  - `invalid` ones leave the queue and show "Some changes couldn't be saved."
  - A `401` keeps the queue and shows "Sign in again to sync your changes."
  - A network error keeps the queue silently.
- **Sync request limits:** at most 200 changes per request. `at` must be within the last 30 days and no more than 5 minutes in the future; anything else is `400`.
- **Unauthenticated `/api/*` requests** get `401` JSON from the proxy, not a redirect to `/login`.
- **Offline data is per user.** IndexedDB records are keyed by user id. Everything under the `foodini-` prefix (IndexedDB and Cache Storage) is cleared on explicit sign-out: `signOut` redirects to `/login?signedOut=1`, and the login page clears the data. An expired session that leads to re-signing in keeps the queue, so it can still sync.
- **Service worker:**
  - Served at `/sw.js` with `Cache-Control: no-cache, no-store, must-revalidate`.
  - Registered with `{ scope: "/", updateViaCache: "none" }`, and only when `NODE_ENV === "production"`.
  - Caches only `/_next/static/*` (cache-first) and `/list` navigations (network-first, falling back to the cache).
  - Cache names start with `foodini-v1-`; bump the version to invalidate.
  - `/sw.js` is excluded from the proxy matcher.
- **Service-worker end-to-end tests** run against a production build (`next build && next start`) on port 3200 with `NEXT_DIST_DIR=.next-e2e-prod`. They have their own config and script (`pnpm test:e2e:sw`) so the main e2e suite stays fast.

## Review Focus

1. **A check-off made offline survives a reload and syncs later,** never silently lost. Tests: Task 4 e2e `check-offs made offline sync when the connection returns` and `a check-off survives an immediate reload`.
2. **An older offline change never overwrites a newer change from another device.** Tests: Task 2 `ignores changes older than the row`; Task 4 e2e `a newer change from another device wins`.
3. **A forged or malformed sync request** (another user's extra, a bad week or key, an absurd timestamp, no session) is rejected without a 500. Tests: Task 1 `parseSyncBody` cases; Task 2 `marks invalid changes`; Task 4 e2e `the sync endpoint rejects unauthenticated and malformed requests`.
4. **A cold open with no signal** after one online visit shows the list and accepts check-offs, served by the service worker. Test: Task 5 SW e2e, using `response.fromServiceWorker()`.
5. **Signing out removes lists saved on the device.** Test: Task 5 SW e2e `signing out clears lists saved on the device`.

---

## File Structure

```
lib/offline-queue.ts (+ test)        ListChange, enqueue, removeSynced, applyPending, parseSyncBody,
                                     isListWeek, isLineKey, targetOf, SyncResult
db/schema.ts                         (modify) grocery_extras.updated_at
db/migrations/0006_*.sql             generated
db/queries/grocery.ts                (modify) `at` on check/uncheck/extras; applyGroceryChanges
app/api/grocery/sync/route.ts        POST sync endpoint
server/session.ts                    (modify) 401 JSON for /api/*
app/(app)/list/actions.ts            (modify) drop toggle actions; shared validators
app/(app)/list/offline-store.ts      IndexedDB snapshot + queue, clearOfflineData
app/(app)/list/grocery-lines.tsx     (rewrite) snapshot + queue + sync + badge
app/(app)/list/add-extra-form.tsx    (modify) disabled offline
app/(app)/list/page.tsx              (modify) pass userId and generatedAt
components/use-online.ts             useOnline()
components/clear-offline-data.tsx    client: clears on /login?signedOut=1
components/service-worker.tsx        client: registers /sw.js in production
app/(app)/actions.ts                 (modify) signOut → /login?signedOut=1
app/(app)/layout.tsx                 (modify) <ServiceWorker />
app/login/page.tsx                   (modify) <ClearOfflineData /> when signedOut=1
public/sw.js                         the service worker
next.config.ts                       (modify) /sw.js headers
proxy.ts                             (modify) exclude sw.js
playwright.sw.config.ts, tests/e2e-sw/offline-sw.spec.ts
tests/e2e/offline.spec.ts, tests/e2e/helpers.ts (modify)
tests/integration/grocery.test.ts    (modify)
docs/ ROADMAP.md, CHANGELOG.md, DECISIONS.md, README.md
```

---

### Task 1: Pure queue logic

**Files:**
- Create: `lib/offline-queue.ts`, `lib/offline-queue.test.ts`
- Modify: `app/(app)/list/actions.ts` (use the shared validators)

**Interfaces:**
- Consumes: `isIsoDate`, `mondayOf` (`lib/dates.ts`); `GroceryLine` (`lib/grocery.ts`)
- Produces:

```ts
export type ListChange =
  | { kind: "line"; week: string; key: string; checked: boolean; at: number }
  | { kind: "extra"; week: string; id: string; checked: boolean; at: number };
export type SyncStatus = "ok" | "stale" | "invalid";
export type SyncResult = { target: string; at: number; status: SyncStatus };
export function isListWeek(week: unknown): week is string;   // ISO date that is a Monday
export function isLineKey(key: unknown): key is string;      // item:/raw:, ≤ 500 chars
export function targetOf(change: ListChange): string;        // "line:<week>:<key>" | "extra:<id>"
export function enqueue(queue: ListChange[], change: ListChange): ListChange[];
export function removeSynced(queue: ListChange[], sent: ListChange[]): ListChange[];
export function applyPending<L extends Pick<GroceryLine, "key" | "extraId" | "checked">>(
  sections: { section: string; lines: L[] }[], queue: ListChange[], week: string,
): { section: string; lines: L[] }[];
export function parseSyncBody(body: unknown, now?: number): { ok: true; changes: ListChange[] } | { ok: false };
```

- [ ] **Step 1: Write the failing tests**

`lib/offline-queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPending, enqueue, isLineKey, isListWeek, parseSyncBody, removeSynced, targetOf, type ListChange } from "./offline-queue";

const WEEK = "2026-09-28";
const line = (key: string, checked: boolean, at: number): ListChange => ({ kind: "line", week: WEEK, key, checked, at });
const extra = (id: string, checked: boolean, at: number): ListChange => ({ kind: "extra", week: WEEK, id, checked, at });
const ID = "3f0f06de-0fbf-4e77-87d2-5b0c4712972b";

describe("validators", () => {
  it("accepts only Monday weeks and well-formed keys", () => {
    expect(isListWeek("2026-09-28")).toBe(true);
    expect(isListWeek("2026-09-29")).toBe(false);
    expect(isListWeek("junk")).toBe(false);
    expect(isLineKey("item:abc:volume")).toBe(true);
    expect(isLineKey("raw:for the sauce:")).toBe(true);
    expect(isLineKey("extra:abc")).toBe(false);
    expect(isLineKey(`raw:${"x".repeat(600)}`)).toBe(false);
  });
});

describe("enqueue and removeSynced", () => {
  it("keeps only the newest change per target", () => {
    const q = enqueue(enqueue(enqueue([], line("item:a:volume", true, 1)), extra(ID, true, 2)), line("item:a:volume", false, 3));
    expect(q).toEqual([extra(ID, true, 2), line("item:a:volume", false, 3)]);
    expect(targetOf(q[1])).toBe(`line:${WEEK}:item:a:volume`);
  });

  it("removes what was sent but keeps a newer change queued during the send", () => {
    const sent = [line("item:a:volume", true, 1), extra(ID, true, 2)];
    const now = enqueue(sent, line("item:a:volume", false, 5));
    expect(removeSynced(now, sent)).toEqual([line("item:a:volume", false, 5)]);
  });
});

describe("applyPending", () => {
  const sections = [
    {
      section: "pantry",
      lines: [
        { key: "item:a:volume", extraId: null, checked: false },
        { key: "item:b:volume", extraId: null, checked: true },
        { key: "extra:e", extraId: ID, checked: false },
      ],
    },
  ];

  it("shows queued changes on top of the list", () => {
    const shown = applyPending(sections, [line("item:a:volume", true, 1), line("item:b:volume", false, 2), extra(ID, true, 3)], WEEK);
    expect(shown[0].lines.map((l) => l.checked)).toEqual([true, false, true]);
  });

  it("ignores changes for another week", () => {
    const other: ListChange = { kind: "line", week: "2026-10-05", key: "item:a:volume", checked: true, at: 1 };
    expect(applyPending(sections, [other], WEEK)[0].lines[0].checked).toBe(false);
  });
});

describe("parseSyncBody", () => {
  const now = Date.UTC(2026, 8, 28, 12);

  it("accepts a valid batch", () => {
    const body = { changes: [line("item:a:volume", true, now - 1000), extra(ID, false, now)] };
    expect(parseSyncBody(body, now)).toEqual({ ok: true, changes: body.changes });
  });

  it.each([
    ["not an object", "nope"],
    ["missing changes", {}],
    ["bad kind", { changes: [{ kind: "other", week: WEEK, key: "item:a:volume", checked: true, at: now }] }],
    ["bad week", { changes: [{ kind: "line", week: "2026-09-29", key: "item:a:volume", checked: true, at: now }] }],
    ["bad key", { changes: [{ kind: "line", week: WEEK, key: "extra:x", checked: true, at: now }] }],
    ["bad extra id", { changes: [{ kind: "extra", week: WEEK, id: "not-a-uuid", checked: true, at: now }] }],
    ["too far in the future", { changes: [line("item:a:volume", true, now + 10 * 60_000)] }],
    ["too old", { changes: [line("item:a:volume", true, now - 31 * 86_400_000)] }],
    ["too many", { changes: Array.from({ length: 201 }, (_, i) => line(`item:${i}:volume`, true, now)) }],
  ])("rejects %s", (_name, body) => {
    expect(parseSyncBody(body, now)).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/offline-queue.test.ts`
Expected: FAIL, "Cannot find module './offline-queue'".

- [ ] **Step 3: Implement `lib/offline-queue.ts`**

```ts
import { z } from "zod";
import { isIsoDate, mondayOf } from "./dates";
import type { GroceryLine } from "./grocery";

export type ListChange =
  | { kind: "line"; week: string; key: string; checked: boolean; at: number }
  | { kind: "extra"; week: string; id: string; checked: boolean; at: number };
export type SyncStatus = "ok" | "stale" | "invalid";
export type SyncResult = { target: string; at: number; status: SyncStatus };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHANGES = 200;
const MAX_AGE_MS = 30 * 86_400_000;
const MAX_SKEW_MS = 5 * 60_000;

export function isListWeek(week: unknown): week is string {
  return typeof week === "string" && isIsoDate(week) && mondayOf(week) === week;
}

export function isLineKey(key: unknown): key is string {
  return typeof key === "string" && key.length <= 500 && /^(item|raw):/.test(key);
}

export function targetOf(change: ListChange): string {
  return change.kind === "line" ? `line:${change.week}:${change.key}` : `extra:${change.id}`;
}

/** Adds a change, replacing any older queued change to the same line or extra. */
export function enqueue(queue: ListChange[], change: ListChange): ListChange[] {
  const target = targetOf(change);
  return [...queue.filter((c) => targetOf(c) !== target), change];
}

/** Drops the changes that were sent; a newer change queued meanwhile for the same target stays. */
export function removeSynced(queue: ListChange[], sent: ListChange[]): ListChange[] {
  const sentKeys = new Set(sent.map((c) => `${targetOf(c)}@${c.at}`));
  return queue.filter((c) => !sentKeys.has(`${targetOf(c)}@${c.at}`));
}

/** The list as the user should see it: queued changes for this week override the checked state. */
export function applyPending<L extends Pick<GroceryLine, "key" | "extraId" | "checked">>(
  sections: { section: string; lines: L[] }[],
  queue: ListChange[],
  week: string,
): { section: string; lines: L[] }[] {
  const lineState = new Map<string, boolean>();
  const extraState = new Map<string, boolean>();
  for (const c of queue) {
    if (c.week !== week) continue;
    if (c.kind === "line") lineState.set(c.key, c.checked);
    else extraState.set(c.id, c.checked);
  }
  if (lineState.size === 0 && extraState.size === 0) return sections;
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => {
      const override = l.extraId ? extraState.get(l.extraId) : lineState.get(l.key);
      return override === undefined ? l : { ...l, checked: override };
    }),
  }));
}

export function parseSyncBody(body: unknown, now: number = Date.now()): { ok: true; changes: ListChange[] } | { ok: false } {
  const at = z.number().int().min(now - MAX_AGE_MS).max(now + MAX_SKEW_MS);
  const week = z.string().refine(isListWeek);
  const schema = z.object({
    changes: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("line"), week, key: z.string().refine(isLineKey), checked: z.boolean(), at }),
          z.object({ kind: z.literal("extra"), week, id: z.string().regex(UUID), checked: z.boolean(), at }),
        ]),
      )
      .max(MAX_CHANGES),
  });
  const result = schema.safeParse(body);
  return result.success ? { ok: true, changes: result.data.changes } : { ok: false };
}
```

In `app/(app)/list/actions.ts`, delete the local `validWeek` and `validKey` definitions, import `isListWeek` and `isLineKey` from `@/lib/offline-queue`, and replace `validWeek(` → `isListWeek(` and `validKey(` → `isLineKey(`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: PASS, with no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/offline-queue.ts lib/offline-queue.test.ts "app/(app)/list/actions.ts"
git commit -m "Add offline queue logic for grocery check-offs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server sync: last-write-wins and the sync endpoint

**Files:**
- Modify: `db/schema.ts`, `db/queries/grocery.ts`, `server/session.ts`, `app/(app)/list/actions.ts`, `tests/integration/grocery.test.ts`
- Create: `db/migrations/0006_<generated>.sql`, `app/api/grocery/sync/route.ts`

**Interfaces:**
- Consumes: `ListChange`, `SyncResult`, `SyncStatus`, `isListWeek`, `isLineKey`, `targetOf`, `parseSyncBody` (Task 1)
- Produces:
  - `checkGroceryLine(userId, week, key, at?: Date)` and `uncheckGroceryLine(userId, week, key, at?: Date)`
  - `applyGroceryChanges(userId: string, changes: ListChange[]): Promise<SyncResult[]>`
  - `POST /api/grocery/sync` taking body `{ changes: ListChange[] }` and returning `200 { results: SyncResult[] }`, `400 { error: "invalid" }` or `401 { error: "signed-out" }`

- [ ] **Step 1: Write the failing integration tests**

Append inside `describe("grocery queries", …)` in `tests/integration/grocery.test.ts` (and add `applyGroceryChanges` to the `@/db/queries/grocery` import):

```ts
  it("applies synced changes with the device's timestamp", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, recipe("Soup", ["2 cups stock"]));
    await plan(u.id, r);
    const [lineOnList] = (await getGroceryList(u.id, WEEK)).sections[0].lines;
    const extraId = (await addGroceryExtra(u.id, WEEK, "paper towels"))!;
    const now = Date.now();
    const results = await applyGroceryChanges(u.id, [
      { kind: "line", week: WEEK, key: lineOnList.key, checked: true, at: now },
      { kind: "extra", week: WEEK, id: extraId, checked: true, at: now },
    ]);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(await labels(u.id)).toEqual(["✓ 2 cups stock", "✓ paper towels"]);
  });

  it("ignores changes older than the row", async () => {
    const u = await newUser();
    const r = await createRecipe(u.id, recipe("Soup", ["2 cups stock"]));
    await plan(u.id, r);
    const [lineOnList] = (await getGroceryList(u.id, WEEK)).sections[0].lines;
    const extraId = (await addGroceryExtra(u.id, WEEK, "paper towels"))!;
    const now = Date.now();
    await applyGroceryChanges(u.id, [
      { kind: "line", week: WEEK, key: lineOnList.key, checked: true, at: now },
      { kind: "extra", week: WEEK, id: extraId, checked: true, at: now },
    ]);
    const older = await applyGroceryChanges(u.id, [
      { kind: "line", week: WEEK, key: lineOnList.key, checked: false, at: now - 60_000 },
      { kind: "extra", week: WEEK, id: extraId, checked: false, at: now - 60_000 },
    ]);
    expect(older.map((r) => r.status)).toEqual(["stale", "stale"]);
    expect(await labels(u.id)).toEqual(["✓ 2 cups stock", "✓ paper towels"]);
  });

  it("marks invalid changes: bad week or key, and another user's extra", async () => {
    const [u, other] = await Promise.all([newUser(), newUser()]);
    const theirs = (await addGroceryExtra(other.id, WEEK, "towels"))!;
    const now = Date.now();
    const results = await applyGroceryChanges(u.id, [
      { kind: "line", week: "2026-09-29", key: "item:x:volume", checked: true, at: now },
      { kind: "line", week: WEEK, key: "extra:x", checked: true, at: now },
      { kind: "extra", week: WEEK, id: theirs, checked: true, at: now },
    ]);
    expect(results.map((r) => r.status)).toEqual(["invalid", "invalid", "invalid"]);
    expect(await labels(other.id)).toEqual(["towels"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:int tests/integration/grocery.test.ts`
Expected: FAIL, because `applyGroceryChanges` isn't exported.

- [ ] **Step 3: Add `grocery_extras.updated_at`**

In `db/schema.ts`, add to `groceryExtras` after `checked`:

```ts
    /** When `checked` last changed; offline sync compares against it (last write wins). */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
```

Run: `pnpm db:generate --name=grocery_extras_updated_at && pnpm db:migrate`
Expected: a `0006_…sql` with `ALTER TABLE "grocery_extras" ADD COLUMN "updated_at" … DEFAULT now() NOT NULL`, applied.

- [ ] **Step 4: Last-write-wins in `db/queries/grocery.ts`**

Change the imports to add `ListChange`, `SyncResult`, `SyncStatus`, `isLineKey`, `isListWeek` and `targetOf` from `@/lib/offline-queue`.

Replace `upsertMark`, `checkGroceryLine`, `uncheckGroceryLine` and `setGroceryExtraChecked` with the versions below, and add `applyGroceryChanges`:

```ts
async function upsertMark(
  userId: string,
  weekStart: string,
  key: string,
  patch: Partial<Pick<GroceryMark, "checked" | "checkedQty" | "hidden">>,
  at?: Date,
) {
  // `updated_at` tracks the checked state only, so hiding a line doesn't make a queued check-off stale.
  const stamp = at ? { updatedAt: at } : {};
  await db
    .insert(groceryMarks)
    .values({ userId, weekStart, key, ...patch, ...stamp })
    .onConflictDoUpdate({ target: [groceryMarks.userId, groceryMarks.weekStart, groceryMarks.key], set: { ...patch, ...stamp } });
}

/** Marks the line's current shortfall as bought. The amount is always computed here, never taken from the client. */
export async function checkGroceryLine(userId: string, weekStart: string, key: string, at: Date = new Date()): Promise<boolean> {
  const list = await getGroceryList(userId, weekStart, { showHidden: true });
  const need = list.sections.flatMap((s) => s.lines).find((l) => l.kind === "need" && l.key === key);
  if (!need) return false;
  const [mark] = (await listMarks(userId, weekStart)).filter((m) => m.key === key);
  const already = mark?.checked ? (mark.checkedQty ?? 0) : 0;
  await upsertMark(userId, weekStart, key, { checked: true, checkedQty: need.shortfallBase === null ? null : already + need.shortfallBase }, at);
  return true;
}

export async function uncheckGroceryLine(userId: string, weekStart: string, key: string, at: Date = new Date()): Promise<void> {
  await upsertMark(userId, weekStart, key, { checked: false, checkedQty: null }, at);
}

export async function setGroceryExtraChecked(userId: string, id: string, checked: boolean, at: Date = new Date()): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db
    .update(groceryExtras)
    .set({ checked, updatedAt: at })
    .where(and(eq(groceryExtras.id, id), eq(groceryExtras.userId, userId)))
    .returning({ id: groceryExtras.id });
  return rows.length > 0;
}

/** Applies queued device changes in order. Last write wins: a change older than the row is skipped. */
export async function applyGroceryChanges(userId: string, changes: ListChange[]): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const change of changes) {
    const at = new Date(change.at);
    const done = (status: SyncStatus) => results.push({ target: targetOf(change), at: change.at, status });
    if (change.kind === "line") {
      if (!isListWeek(change.week) || !isLineKey(change.key)) {
        done("invalid");
        continue;
      }
      const [mark] = await db
        .select({ updatedAt: groceryMarks.updatedAt })
        .from(groceryMarks)
        .where(and(eq(groceryMarks.userId, userId), eq(groceryMarks.weekStart, change.week), eq(groceryMarks.key, change.key)));
      if (mark && mark.updatedAt > at) {
        done("stale");
        continue;
      }
      if (change.checked) await checkGroceryLine(userId, change.week, change.key, at);
      else await uncheckGroceryLine(userId, change.week, change.key, at);
      done("ok");
    } else {
      if (!UUID.test(change.id)) {
        done("invalid");
        continue;
      }
      const [row] = await db
        .select({ updatedAt: groceryExtras.updatedAt })
        .from(groceryExtras)
        .where(and(eq(groceryExtras.id, change.id), eq(groceryExtras.userId, userId)));
      if (!row) done("invalid");
      else if (row.updatedAt > at) done("stale");
      else {
        await setGroceryExtraChecked(userId, change.id, change.checked, at);
        done("ok");
      }
    }
  }
  return results;
}
```

- [ ] **Step 5: The sync endpoint and the 401 for `/api`**

`app/api/grocery/sync/route.ts`:

```ts
import { revalidatePath } from "next/cache";
import { applyGroceryChanges } from "@/db/queries/grocery";
import { parseSyncBody } from "@/lib/offline-queue";
import { getUser } from "@/server/auth";

/** Applies a batch of offline check-offs. See lib/offline-queue.ts for the change format. */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "signed-out" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = parseSyncBody(body);
  if (!parsed.ok) return Response.json({ error: "invalid" }, { status: 400 });
  const results = await applyGroceryChanges(user.id, parsed.changes);
  revalidatePath("/list");
  return Response.json({ results });
}
```

In `server/session.ts`, inside `if (!data?.claims && !isPublic) {`, before building the login redirect, add:

```ts
    // API callers (the offline sync) need a status code, not an HTML login page.
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "signed-out" }, { status: 401 });
```

In `app/(app)/list/actions.ts`, delete `toggleLineAction` and `toggleExtraAction`, which the sync endpoint replaces, and remove the imports that are now unused.

- [ ] **Step 6: Run the tests**

Run: `pnpm test:int && pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS and clean. `tsc` fails in `grocery-lines.tsx`, which still imports the deleted toggle actions. Task 3 rewrites that file, so for now replace those two calls with `await Promise.resolve()` and ledger it as an interim step.

- [ ] **Step 7: Commit**

```bash
git add db "app/api" server/session.ts "app/(app)/list" tests/integration/grocery.test.ts
git commit -m "Add the grocery sync endpoint with last-write-wins" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The offline list on the client

**Files:**
- Create: `components/use-online.ts`, `components/clear-offline-data.tsx`, `app/(app)/list/offline-store.ts`
- Modify:
  - `app/(app)/list/grocery-lines.tsx` (rewrite), `add-extra-form.tsx` and `page.tsx`
  - `app/(app)/actions.ts` and `app/login/page.tsx`

**Interfaces:**
- Consumes: Task 1 and the sync endpoint (Task 2); `hideLineAction` and `removeExtraAction` (phase 3a)
- Produces:
  - `useOnline(): boolean`
  - `type Snapshot = { week: string; sections: …; generatedAt: string }`
  - `loadSnapshot(userId, week)`, `saveSnapshot(userId, snapshot)`, `loadQueue(userId)`, `saveQueue(userId, queue)`, `clearOfflineData()`
  - `GroceryLines` props: `{ userId, week, sections, generatedAt }`

- [ ] **Step 1: `components/use-online.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Whether the browser reports a network connection. Assumes online during server rendering. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
```

- [ ] **Step 2: `app/(app)/list/offline-store.ts`**

```ts
import type { GroceryLine } from "@/lib/grocery";
import type { ListChange } from "@/lib/offline-queue";

export type Snapshot = { week: string; sections: { section: string; lines: GroceryLine[] }[]; generatedAt: string };

// Everything this app stores on the device starts with "foodini-" so sign-out can clear it.
const DB_NAME = "foodini-offline";
const SNAPSHOTS = "snapshots";
const QUEUES = "queues";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS);
      if (!db.objectStoreNames.contains(QUEUES)) db.createObjectStore(QUEUES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs one request in a transaction. Returns undefined if storage is unavailable (e.g. private browsing). */
async function run<T>(store: string, mode: IDBTransactionMode, makeRequest: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = makeRequest(tx.objectStore(store));
      tx.oncomplete = () => {
        db.close();
        resolve(request.result as T);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return undefined;
  }
}

export const loadSnapshot = (userId: string, week: string) => run<Snapshot>(SNAPSHOTS, "readonly", (s) => s.get(`${userId}:${week}`));
export const saveSnapshot = (userId: string, snapshot: Snapshot) => run(SNAPSHOTS, "readwrite", (s) => s.put(snapshot, `${userId}:${snapshot.week}`));
export const loadQueue = async (userId: string) => (await run<ListChange[]>(QUEUES, "readonly", (s) => s.get(userId))) ?? [];
export const saveQueue = (userId: string, queue: ListChange[]) => run(QUEUES, "readwrite", (s) => s.put(queue, userId));

/** Removes lists and queues saved on this device, and the service worker's caches. */
export async function clearOfflineData(): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  try {
    for (const key of await caches.keys()) if (key.startsWith("foodini-")) await caches.delete(key);
  } catch {
    // Cache Storage unavailable: nothing to clear.
  }
}
```

- [ ] **Step 3: Rewrite `app/(app)/list/grocery-lines.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ui } from "@/components/ui";
import { useOnline } from "@/components/use-online";
import type { GroceryLine } from "@/lib/grocery";
import { applyPending, enqueue, removeSynced, type ListChange, type SyncResult } from "@/lib/offline-queue";
import { hideLineAction, removeExtraAction } from "./actions";
import { loadQueue, loadSnapshot, saveQueue, saveSnapshot, type Snapshot } from "./offline-store";

type Section = Snapshot["sections"][number];

export function GroceryLines({ userId, week, sections, generatedAt }: { userId: string; week: string; sections: Section[]; generatedAt: string }) {
  const router = useRouter();
  const online = useOnline();
  const [base, setBase] = useState<Snapshot>({ week, sections, generatedAt });
  const [queue, setQueue] = useState<ListChange[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const queueRef = useRef<ListChange[]>([]);
  const flushing = useRef(false);

  // Show the newest copy of the list: this render from the server, or a newer one saved on the device
  // (a page served by the service worker carries the list from when it was cached).
  useEffect(() => {
    let cancelled = false;
    const fromServer: Snapshot = { week, sections, generatedAt };
    (async () => {
      const saved = await loadSnapshot(userId, week);
      if (cancelled) return;
      if (saved && saved.generatedAt > generatedAt) setBase(saved);
      else {
        setBase(fromServer);
        await saveSnapshot(userId, fromServer);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, week, sections, generatedAt]);

  const storeQueue = useCallback(
    async (next: ListChange[]) => {
      queueRef.current = next;
      setQueue(next);
      await saveQueue(userId, next);
    },
    [userId],
  );

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine || queueRef.current.length === 0) return;
    flushing.current = true;
    const batch = queueRef.current;
    try {
      const response = await fetch("/api/grocery/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes: batch }),
      });
      if (response.status === 401) {
        setMessage("Sign in again to sync your changes.");
        return;
      }
      if (response.status === 400) {
        setMessage("Some changes couldn't be saved.");
        await storeQueue(removeSynced(queueRef.current, batch));
        return;
      }
      if (!response.ok) return;
      const { results } = (await response.json()) as { results: SyncResult[] };
      if (results.some((r) => r.status === "invalid")) setMessage("Some changes couldn't be saved.");
      // Keep showing the synced state until the server's re-render arrives.
      setBase((b) => ({ ...b, sections: applyPending(b.sections, batch, week) }));
      await storeQueue(removeSynced(queueRef.current, batch));
      router.refresh();
    } catch {
      // Offline or unreachable: keep the queue and try again on the next online, focus or load.
    } finally {
      flushing.current = false;
    }
  }, [router, storeQueue, week]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadQueue(userId);
      if (cancelled) return;
      queueRef.current = saved;
      setQueue(saved);
      void flush();
    })();
    const retry = () => void flush();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [userId, flush]);

  async function toggle(line: GroceryLine) {
    const change: ListChange = line.extraId
      ? { kind: "extra", week, id: line.extraId, checked: !line.checked, at: Date.now() }
      : { kind: "line", week, key: line.key, checked: !line.checked, at: Date.now() };
    setMessage(null);
    await storeQueue(enqueue(queueRef.current, change));
    void flush();
  }

  const shown = useMemo(() => applyPending(base.sections, queue, week), [base, queue, week]);
  const pending = queue.length;

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="space-y-2 text-sm empty:hidden">
        {!online && (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            You’re offline. Check-offs are saved on this device and sync when you’re back online.
          </p>
        )}
        {pending > 0 && (
          <p role="status" className="text-neutral-600 dark:text-neutral-400">
            {pending} change{pending === 1 ? "" : "s"} waiting to sync
          </p>
        )}
        {message && (
          <p role="alert" className={ui.error}>
            {message}
          </p>
        )}
      </div>
      {shown.map(({ section, lines }) => (
        <section key={section} aria-labelledby={`section-${section}`}>
          <h2 id={`section-${section}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {section}
          </h2>
          <ul className={`${ui.card} divide-y divide-neutral-100 p-0 dark:divide-neutral-800`}>
            {lines.map((line) => (
              <li key={line.id} className={`flex items-center gap-3 px-4 py-3 ${line.hidden ? "opacity-50" : ""}`}>
                <input
                  id={`line-${line.id}`}
                  type="checkbox"
                  checked={line.checked}
                  onChange={() => void toggle(line)}
                  className="size-5 shrink-0 accent-emerald-700"
                />
                <label htmlFor={`line-${line.id}`} className="min-w-0 flex-1">
                  <span className={line.checked ? "text-neutral-500 line-through" : ""}>{line.label}</span>
                  {line.recipes.length > 0 && <span className="block truncate text-xs text-neutral-500">for {line.recipes.join(", ")}</span>}
                </label>
                {line.extraId ? (
                  <form action={removeExtraAction.bind(null, line.extraId)}>
                    <button type="submit" disabled={!online} aria-label={`Remove ${line.name}`} className="text-sm text-neutral-500 hover:underline disabled:opacity-40">
                      Remove
                    </button>
                  </form>
                ) : (
                  <form action={hideLineAction.bind(null, week, line.key, !line.hidden)}>
                    <button
                      type="submit"
                      disabled={!online}
                      aria-label={`${line.hidden ? "Unhide" : "Hide"} ${line.name}`}
                      className="text-sm text-neutral-500 hover:underline disabled:opacity-40"
                    >
                      {line.hidden ? "Unhide" : "Hide"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire the page, the add form and sign-out**

In `app/(app)/list/page.tsx`, pass the new props:

```tsx
        <GroceryLines userId={user.id} week={week} sections={list.sections} generatedAt={new Date().toISOString()} />
```

In `app/(app)/list/add-extra-form.tsx`:
- Import `useOnline` from `@/components/use-online`, and call `const online = useOnline();` in the component.
- Give the button `disabled={pending || !online}`.
- Directly after the button, add:
  ```tsx
  {!online && <p className={`${ui.hint} w-full`}>Adding items needs a connection.</p>}
  ```

`components/clear-offline-data.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { clearOfflineData } from "@/app/(app)/list/offline-store";

/** Rendered on /login after an explicit sign-out: removes lists saved on this device. */
export function ClearOfflineData() {
  useEffect(() => {
    void clearOfflineData();
  }, []);
  return null;
}
```

In `app/(app)/actions.ts`, change `redirect("/login")` to `redirect("/login?signedOut=1")`.

In `app/login/page.tsx`, import `ClearOfflineData` and render `{params.signedOut === "1" && <ClearOfflineData />}` as the first child of `<main>`.

- [ ] **Step 5: Type-check, lint, unit tests, and the existing list e2e**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm exec playwright test tests/e2e/list.spec.ts`
Expected: all green. That includes the phase 3a list tests, which now go through the queue and the sync endpoint: they wait for "· 1 checked" and for keyboard focus. If the focus test fails because the row re-mounts, check that `line.id` is still the stable key from phase 3a.

- [ ] **Step 6: Commit**

```bash
git add components "app/(app)" app/login
git commit -m "Keep the grocery list working offline" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Offline end-to-end tests (dev server)

**Files:**
- Modify: `tests/e2e/helpers.ts`
- Create: `tests/e2e/offline.spec.ts`

**Interfaces:**
- Produces:
  - `signInAsNewUser(page, domain?)` now returns `{ id, email }`
  - `signInAs(page, email)`, which signs a page in as an existing user

- [ ] **Step 1: Helpers**

In `tests/e2e/helpers.ts`, make `signInAsNewUser` return `{ id: created.user.id, email }`, and add:

```ts
/** Signs `page` in as an existing user (e.g. the same user on a second device). */
export async function signInAs(page: Page, email: string): Promise<void> {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&next=/recipes`);
  await page.waitForURL("**/recipes");
}
```

- [ ] **Step 2: Write the tests**

`tests/e2e/offline.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAs, signInAsNewUser } from "./helpers";

test.use({ timezoneId: "America/Los_Angeles" });

const line = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

async function planSoup(page: Page) {
  const url = await createRecipeViaUi(page, "Soup", 2, "2 cups stock\n1 onion");
  await page.goto(url);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
}

test.describe("offline grocery list", () => {
  let userId: string;
  let email: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId, email } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("check-offs made offline sync when the connection returns", async ({ page, context }) => {
    await planSoup(page);
    await page.goto("/list");
    await context.setOffline(true);
    await expect(page.getByText("You’re offline.")).toBeVisible();
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await line(page, "1 onion").getByRole("checkbox").check();
    await expect(page.getByText("2 changes waiting to sync")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide stock" })).toBeDisabled();

    await context.setOffline(false);
    await expect(page.getByText(/changes? waiting to sync/)).toHaveCount(0);
    await expect(page.getByText(/· 2 checked/)).toBeVisible();
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).toBeChecked();
    await expect(line(page, "1 onion").getByRole("checkbox")).toBeChecked();
  });

  test("a check-off survives an immediate reload", async ({ page }) => {
    await planSoup(page);
    await page.goto("/list");
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).toBeChecked();
    await expect(page.getByText(/· 1 checked/)).toBeVisible();
  });

  test("a newer change from another device wins", async ({ page, context, browser }) => {
    await planSoup(page);
    await page.goto("/list");
    await context.setOffline(true);
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await expect(page.getByText("1 change waiting to sync")).toBeVisible();

    const otherContext = await browser.newContext({ timezoneId: "America/Los_Angeles" });
    const other = await otherContext.newPage();
    try {
      await signInAs(other, email);
      await other.goto("/list");
      await line(other, "2 cups stock").getByRole("checkbox").check();
      await expect(other.getByText(/· 1 checked/)).toBeVisible();
      await line(other, "2 cups stock").getByRole("checkbox").uncheck();
      await expect(other.getByText(/· 1 checked/)).toHaveCount(0);
    } finally {
      await otherContext.close();
    }

    await context.setOffline(false);
    await expect(page.getByText(/change waiting to sync/)).toHaveCount(0);
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("alert").filter({ hasText: "couldn't be saved" })).toHaveCount(0);
  });

  test("the sync endpoint rejects unauthenticated and malformed requests", async ({ page, request }) => {
    expect((await request.post("/api/grocery/sync", { data: { changes: [] } })).status()).toBe(401);
    expect((await page.request.post("/api/grocery/sync", { data: { nope: 1 } })).status()).toBe(400);
    const ok = await page.request.post("/api/grocery/sync", { data: { changes: [] } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ results: [] });
  });
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS: the 17 earlier tests plus these 4.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "Add offline grocery list end-to-end tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Service worker for a cold offline open

**Files:**
- Create: `public/sw.js`, `components/service-worker.tsx`, `playwright.sw.config.ts`, `tests/e2e-sw/offline-sw.spec.ts`
- Modify: `app/(app)/layout.tsx`, `next.config.ts`, `proxy.ts`, `package.json`, `.gitignore`, `eslint.config.mjs`

**Interfaces:**
- Consumes: Tasks 3–4, and `signInAsNewUser`, `deleteUser` and `createRecipeViaUi` from `tests/e2e/helpers.ts`
- Produces: `/sw.js`; the script `pnpm test:e2e:sw`

- [ ] **Step 1: The service worker**

`public/sw.js`:

```js
// Foodini service worker: lets /list open with no signal.
// - /_next/static/* (hashed, immutable): cache first.
// - Navigations to /list: network first, falling back to the last cached copy.
// Bump VERSION to drop old caches. Cache names start with "foodini-" so sign-out can clear them.
const VERSION = "foodini-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("foodini-") && !key.startsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate" && url.pathname === "/list") {
    event.respondWith(networkFirstPage(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    // Don't cache the login page a signed-out visit redirects to.
    if (response.ok && !response.redirected) {
      await cache.put(request, response.clone());
      await cache.put("/list", response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match(request)) ?? (await cache.match("/list"));
    return (
      cached ??
      new Response("You’re offline, and the grocery list hasn’t been saved on this device yet.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}
```

- [ ] **Step 2: Registration, headers and the proxy exclusion**

`components/service-worker.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/** Registers /sw.js in production (dev servers reload too often for a service worker). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.error("Service worker registration failed", error);
    });
  }, []);
  return null;
}
```

In `app/(app)/layout.tsx`, import it and render `<ServiceWorker />` next to `<TimezoneCookie />`.

In `next.config.ts`, add to `nextConfig`:

```ts
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
```

In `proxy.ts`, change the matcher to exclude `sw.js`:

```ts
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
```

- [ ] **Step 3: The production-build e2e setup**

`playwright.sw.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the environment directly.
}

const PORT = 3200;

// Service workers only register in production builds, so these tests run against `next build && next start`
// in their own build folder. Kept separate from the main suite because the build takes a while.
export default defineConfig({
  testDir: "tests/e2e-sw",
  workers: 1,
  use: { ...devices["Pixel 7"], baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", timezoneId: "America/Los_Angeles" },
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ...(process.env as Record<string, string>), NEXT_DIST_DIR: ".next-e2e-prod", ALLOWED_EMAILS: "@example.test" },
  },
});
```

Add to the `package.json` scripts: `"test:e2e:sw": "playwright test -c playwright.sw.config.ts"`. Add `/.next-e2e-prod/` to `.gitignore` and `".next-e2e-prod/**"` to the ESLint `globalIgnores`.

- [ ] **Step 4: Write the service-worker tests**

`tests/e2e-sw/offline-sw.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "../e2e/helpers";

const line = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

async function openListUnderServiceWorker(page: Page) {
  const url = await createRecipeViaUi(page, "Offline soup", 2, "2 cups stock");
  await page.goto(url);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
  await page.goto("/list");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once under the service worker's control so the page and its assets are cached.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(line(page, "2 cups stock")).toBeVisible();
}

test("the list opens with no signal after an online visit", async ({ page, context }) => {
  const { id } = await signInAsNewUser(page);
  try {
    await openListUnderServiceWorker(page);
    await context.setOffline(true);
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByText("You’re offline.")).toBeVisible();
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await expect(page.getByText("1 change waiting to sync")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/change waiting to sync/)).toHaveCount(0);
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).toBeChecked();
  } finally {
    await deleteUser(id);
  }
});

test("signing out clears lists saved on the device", async ({ page }) => {
  const { id } = await signInAsNewUser(page);
  try {
    await openListUnderServiceWorker(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?signedOut=1/);
    await expect
      .poll(() =>
        page.evaluate(async () => ({
          caches: (await caches.keys()).filter((k) => k.startsWith("foodini-")).length,
          databases: (await indexedDB.databases()).filter((d) => d.name?.startsWith("foodini-")).length,
        })),
      )
      .toEqual({ caches: 0, databases: 0 });
  } finally {
    await deleteUser(id);
  }
});
```

- [ ] **Step 5: Run both suites**

Run: `pnpm test:e2e:sw`
Expected: PASS (2 tests). The first run builds for 1–2 minutes.

If `setOffline` doesn't reach the service worker, and the reload succeeds without `fromServiceWorker()`, the test fails on that assertion. Don't weaken it: check that the page is controlled (`navigator.serviceWorker.controller`) before going offline, and ledger what you find.

Run: `pnpm test:e2e`
Expected: PASS. The dev server doesn't register the service worker.

`next build` may add `.next-e2e-prod` type paths to `tsconfig.json`, as `next dev` did for `.next-e2e` (D16). Commit that change.

- [ ] **Step 6: Commit**

```bash
git add public/sw.js components/service-worker.tsx "app/(app)/layout.tsx" next.config.ts proxy.ts playwright.sw.config.ts tests/e2e-sw package.json .gitignore eslint.config.mjs tsconfig.json
git commit -m "Add a service worker so the grocery list opens offline" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docs and final checks

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `README.md`

- [ ] **Step 1: Roadmap**
  - In the phase table, set 3b to "In review" (with the PR link once it exists) and phase 4 to "Next".
  - In the Backlog, remove the Grocery list item about losing a check-off when reloading within a second (Task 3 fixes it).
  - Add: "Offline: a cold offline open of `/list` shows the last list page cached on this device. If a different user signed in without signing out first, that page belongs to them until the device is back online (`public/sw.js`)."
  - Add: "Offline: only check-offs work offline. Hiding, removing and adding items need a connection."
  - Add: "Offline: `grocery_marks.updated_at` rows first created by Hide get the current time, so an older offline check-off of that line is treated as stale."

- [ ] **Step 2: Changelog**

Add a "Phase 3b, offline list" block under `## [Unreleased]`:
- **Added:**
  - check-offs saved on the device and synced when back online, on focus or on load;
  - a "waiting to sync" badge and an offline notice;
  - last-write-wins between devices;
  - a service worker that opens `/list` with no signal;
  - `pnpm test:e2e:sw`.
- **Fixed:** a check-off lost when reloading within a second.
- **Changed:** signing out clears lists saved on the device.

- [ ] **Step 3: Decisions**

Append:

```markdown
### D22. Our own offline queue, not Next's `experimental.useOffline`
Check-offs go to an IndexedDB queue and a JSON sync endpoint (`POST /api/grocery/sync`), and a service worker serves `/list` when offline.
**Why:** Next's flag retries failed navigations and Server Actions from memory only, so a reload loses them, and it's experimental. Spec §7 needs changes that survive reloads and a cold offline open.
**Cost:** more code: a queue, a store, an endpoint and a service worker.

### D23. Offline sync is last-write-wins on the device's clock, and the server still computes amounts
A change carries `{ kind, week, key or id, checked, at }` and is skipped if its `at` is older than the row's `updated_at`. The client never sends a quantity: the server records the line's shortfall at sync time.
**Why:** spec §7's conflict rule, and D18's rule that amounts come from the server.
**Cost:** devices with badly wrong clocks can win or lose unexpectedly (`at` is limited to the last 30 days and 5 minutes into the future). A plan changed while offline is reflected in the amount recorded at sync time.

### D24. The service worker caches only static assets and the /list page
`/_next/static/*` is served cache-first, and `/list` navigations network-first. It's registered in production only and tested against a production build (`pnpm test:e2e:sw`).
**Why:** the smallest service worker that meets spec §7, with no risk of serving stale pages elsewhere in the app.
**Cost:** the list opens offline only after one online visit under the service worker's control, and other pages still need a connection.
```

- [ ] **Step 4: README**

Under "Tests", add `pnpm test:e2e:sw    # service worker, against a production build (slow; port 3200)`.

- [ ] **Step 5: Full verification and commit**

Run: `pnpm lint && pnpm test && pnpm test:int && pnpm test:e2e && pnpm test:e2e:sw && pnpm build && pnpm licenses list --prod`
Expected: all green, and licenses unchanged.

```bash
git add docs README.md
git commit -m "Docs for phase 3b: roadmap, changelog and decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
