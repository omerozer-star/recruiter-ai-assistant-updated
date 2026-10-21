import { NextResponse, type NextRequest } from "next/server";

/**
 * Local-only guard for the API. The app has no user accounts, so it must only
 * be reachable from this machine:
 * - Host allow-list blocks DNS-rebinding pages from reading the API.
 * - Origin / Sec-Fetch-Site checks block cross-site requests (CSRF) that
 *   would otherwise let any open web page create or delete data.
 * Extra hosts can be allowed with ALLOWED_HOSTS (comma-separated host[:port]).
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function extraHosts(): Set<string> {
  return new Set(
    (process.env.ALLOWED_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hostAllowed(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  if (extraHosts().has(h)) return true;
  const hostname = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
  return LOCAL_HOSTNAMES.has(hostname);
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (!hostAllowed(host)) {
    return NextResponse.json({ error: "Forbidden host" }, { status: 403 });
  }

  if (!SAFE_METHODS.has(request.method)) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {}
      if (originHost !== host!.toLowerCase()) {
        return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
