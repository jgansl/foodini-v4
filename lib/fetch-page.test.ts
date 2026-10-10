import { describe, expect, it, vi } from "vitest";
import { FetchPageError, fetchPage, isPrivateAddress } from "./fetch-page";

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true], ["10.1.2.3", true], ["172.16.0.1", true], ["172.31.255.255", true], ["172.32.0.1", false],
    ["192.168.1.1", true], ["169.254.169.254", true], ["100.64.0.1", true], ["0.0.0.0", true], ["224.0.0.1", true],
    ["8.8.8.8", false], ["93.184.216.34", false],
    ["::1", true], ["::", true], ["fd00::1", true], ["fe80::1", true], ["ff02::1", true],
    ["::ffff:127.0.0.1", true], ["::ffff:7f00:1", true], ["::ffff:8.8.8.8", false], ["2606:4700::1111", false],
    ["not-an-ip", true],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

const html = (body = "<html>ok</html>", init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const publicLookup = async () => ["93.184.216.34"];

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof FetchPageError) return e.reason;
    throw e;
  }
  throw new Error("expected fetchPage to fail");
}

describe("fetchPage", () => {
  it("returns the HTML and final URL for a public page", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => html("<p>hi</p>"));
    await expect(fetchPage("https://example.com/r", { lookup: publicLookup, fetchImpl })).resolves.toEqual({ url: "https://example.com/r", html: "<p>hi</p>" });
    const [input, init] = fetchImpl.mock.calls[0];
    expect(String(input)).toBe("https://example.com/r");
    expect(init).toMatchObject({ redirect: "manual" });
  });

  it("rejects malformed and non-http URLs", async () => {
    expect(await reasonOf(fetchPage("not a url"))).toBe("invalid-url");
    expect(await reasonOf(fetchPage("ftp://example.com/x"))).toBe("invalid-url");
    expect(await reasonOf(fetchPage("javascript:alert(1)"))).toBe("invalid-url");
  });

  it("blocks hosts that resolve to private addresses without fetching", async () => {
    const fetchImpl = vi.fn();
    expect(await reasonOf(fetchPage("https://intranet.example/", { lookup: async () => ["10.0.0.5"], fetchImpl }))).toBe("blocked");
    expect(await reasonOf(fetchPage("https://mixed.example/", { lookup: async () => ["93.184.216.34", "127.0.0.1"], fetchImpl }))).toBe("blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks literal private IPs, including IPv6 in brackets", async () => {
    const lookup = vi.fn();
    expect(await reasonOf(fetchPage("http://127.0.0.1:3000/", { lookup }))).toBe("blocked");
    expect(await reasonOf(fetchPage("http://[::1]/", { lookup }))).toBe("blocked");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("re-checks every redirect target", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://internal.example/admin" } }));
    const lookup = async (host: string) => (host === "internal.example" ? ["192.168.0.2"] : ["93.184.216.34"]);
    expect(await reasonOf(fetchPage("https://example.com/", { lookup, fetchImpl }))).toBe("blocked");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows relative redirects and reports the final URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/recipes/soup" } }))
      .mockResolvedValueOnce(html());
    await expect(fetchPage("https://example.com/s", { lookup: publicLookup, fetchImpl })).resolves.toMatchObject({ url: "https://example.com/recipes/soup" });
  });

  it("stops after too many redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl, maxRedirects: 3 }))).toBe("http");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("enforces the size limit", async () => {
    const fetchImpl = async () => html("x".repeat(11));
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl, maxBytes: 10 }))).toBe("too-large");
  });

  it("rejects error statuses and non-HTML responses", async () => {
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: async () => html("", { status: 404 }) }))).toBe("http");
    const pdf = async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: pdf }))).toBe("not-html");
  });

  it("maps timeouts and network failures", async () => {
    const timeout = async () => { throw new DOMException("slow", "TimeoutError"); };
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: timeout }))).toBe("timeout");
    const offline = async () => { throw new TypeError("fetch failed"); };
    expect(await reasonOf(fetchPage("https://example.com/", { lookup: publicLookup, fetchImpl: offline }))).toBe("network");
    const noDns = async () => { throw new Error("ENOTFOUND"); };
    expect(await reasonOf(fetchPage("https://nope.example/", { lookup: noDns }))).toBe("network");
  });

  it("allows private addresses only when asked", async () => {
    await expect(fetchPage("http://127.0.0.1:4000/", { allowPrivate: true, fetchImpl: async () => html() })).resolves.toMatchObject({ html: "<html>ok</html>" });
  });
});
