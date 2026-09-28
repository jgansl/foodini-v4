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
