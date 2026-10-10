import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type FetchPageReason = "invalid-url" | "blocked" | "network" | "http" | "not-html" | "timeout" | "too-large";

export class FetchPageError extends Error {
  constructor(
    public readonly reason: FetchPageReason,
    message: string,
  ) {
    super(message);
    this.name = "FetchPageError";
  }
}

export type FetchPageOptions = {
  lookup?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowPrivate?: boolean;
};

const defaultLookup = async (host: string) => (await dnsLookup(host, { all: true })).map((a) => a.address);

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip.toLowerCase());
  return true;
}

function isPrivateV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateV6(ip: string): boolean {
  if (ip === "::" || ip === "::1") return true;
  const mapped = /^::ffff:(.+)$/.exec(ip);
  if (mapped) {
    const rest = mapped[1];
    if (isIP(rest) === 4) return isPrivateV4(rest);
    const [hi, lo] = rest.split(":").map((h) => parseInt(h, 16));
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return true;
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
}

async function assertPublicHost(hostname: string, lookup: (host: string) => Promise<string[]>): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new FetchPageError("network", "Couldn't reach that website.");
    }
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new FetchPageError("blocked", "That address can't be imported.");
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new FetchPageError("too-large", "That page is too large to import.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof FetchPageError) throw error;
    if (isTimeout(error)) throw new FetchPageError("timeout", "That page took too long to load.");
    throw new FetchPageError("network", "Couldn't download that page.");
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Fetches an HTML page for import, refusing private/loopback destinations (checked again after
 * every redirect). Residual risk: DNS can change between our lookup and fetch's own lookup.
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<{ url: string; html: string }> {
  const {
    lookup = defaultLookup,
    fetchImpl = fetch,
    timeoutMs = 10_000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 3,
    allowPrivate = false,
  } = options;

  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new FetchPageError("invalid-url", "Enter a full web address starting with http:// or https://.");
  }
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new FetchPageError("invalid-url", "Enter a full web address starting with http:// or https://.");
    }
    if (!allowPrivate) await assertPublicHost(current.hostname, lookup);

    let response: Response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        signal,
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": "FoodiniRecipeImporter/1.0" },
      });
    } catch (error) {
      if (isTimeout(error)) throw new FetchPageError("timeout", "That page took too long to load.");
      throw new FetchPageError("network", "Couldn't reach that website.");
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new FetchPageError("http", `That page returned an error (${response.status}).`);
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) throw new FetchPageError("not-html", "That link isn't a web page.");
    return { url: current.toString(), html: await readLimited(response, maxBytes) };
  }
  throw new FetchPageError("http", "That page redirected too many times.");
}
