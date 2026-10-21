import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Fetch a user-supplied URL without letting it reach this machine or the
 * internal network (SSRF). The IP check runs inside the socket's DNS lookup,
 * so the address that is validated is the address that is connected to
 * (no DNS-rebinding gap). Redirects are followed manually and re-checked.
 */
const MAX_REDIRECTS = 5;
const MAX_BYTES = 2 * 1024 * 1024;

export class UnsafeUrlError extends Error {}

const blockList = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockList.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockList.addSubnet(addr, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return false;
  // BlockList also applies the IPv4 rules to IPv4-mapped IPv6 (::ffff:a.b.c.d)
  return !blockList.check(address, family === 4 ? "ipv4" : "ipv6");
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = addresses as dns.LookupAddress[];
    const blocked = list.find((a) => !isPublicAddress(a.address));
    if (!list.length || blocked) {
      return callback(new UnsafeUrlError("הכתובת מפנה לרשת פנימית ואינה מותרת"), "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("כתובת לא תקינה");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("מותרות רק כתובות http/https");
  }
  if (url.username || url.password) throw new UnsafeUrlError("כתובת עם פרטי התחברות אינה מותרת");
  // Literal IPs skip DNS, so check them here
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) {
    throw new UnsafeUrlError("הכתובת מפנה לרשת פנימית ואינה מותרת");
  }
  return url;
}

type SafeResponse = { status: number; ok: boolean; text: string };

function requestOnce(url: URL, headers: Record<string, string>, signal: AbortSignal) {
  return new Promise<{ status: number; location?: string; text: string }>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, { method: "GET", headers, lookup: safeLookup, signal }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ status, location: res.headers.location, text: "" });
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          req.destroy(new UnsafeUrlError("הדף גדול מדי"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({ status, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetchText(
  raw: string,
  { headers = {}, timeoutMs = 15000 }: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = parsePublicUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await requestOnce(url, headers, signal);
    if (!res.location) return { status: res.status, ok: res.status >= 200 && res.status < 300, text: res.text };
    url = parsePublicUrl(new URL(res.location, url).toString());
  }
  throw new UnsafeUrlError("יותר מדי הפניות");
}
