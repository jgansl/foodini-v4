import { describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES, checkPhoto } from "./photo-rules";

describe("checkPhoto", () => {
  it("accepts no photo", () => expect(checkPhoto(null)).toEqual({ ok: true }));
  it("accepts JPEG, PNG and WebP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkPhoto({ type, size: PHOTO_MAX_BYTES })).toEqual({ ok: true });
    }
  });
  it("rejects other types, including object prototype keys", () => {
    for (const type of ["image/gif", "application/pdf", "constructor", ""]) {
      expect(checkPhoto({ type, size: 10 })).toEqual({ ok: false, message: "Use a JPEG, PNG or WebP image." });
    }
  });
  it("rejects files over 5 MB", () => {
    expect(checkPhoto({ type: "image/png", size: PHOTO_MAX_BYTES + 1 })).toEqual({ ok: false, message: "Photos must be 5 MB or smaller." });
  });
});
