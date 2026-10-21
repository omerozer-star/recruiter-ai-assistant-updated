import { NextResponse } from "next/server";

/** Small shared input guards for API routes. */

export const PLATFORMS = ["facebook", "whatsapp", "linkedin"] as const;
export const SENIORITIES = ["all", "junior", "mid", "senior", "lead"] as const;

/** Empty, or an absolute http(s) URL. Anything else (javascript:, data:, …) is rejected. */
export function isHttpUrlOrEmpty(value: unknown): value is string {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Clamp to a non-negative integer within [0, max]; non-numbers become `fallback`. */
export function toInt(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 0), max);
}

/** Returns an error response when any listed string field exceeds its limit. */
export function tooLong(body: Record<string, unknown>, limits: Record<string, number>) {
  for (const [field, max] of Object.entries(limits)) {
    const value = body[field];
    if (typeof value === "string" && value.length > max) {
      return NextResponse.json({ error: `השדה ${field} ארוך מדי (עד ${max} תווים)` }, { status: 400 });
    }
  }
  return null;
}

/**
 * Fixed-window limiter for endpoints that call the Anthropic API, so a stray
 * client cannot run up API costs. In-memory: per server process.
 */
const g = globalThis as unknown as { __rateWindows?: Map<string, { start: number; count: number }> };
if (!g.__rateWindows) g.__rateWindows = new Map();

export function rateLimited(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const entry = g.__rateWindows!.get(key);
  if (!entry || now - entry.start > windowMs) {
    g.__rateWindows!.set(key, { start: now, count: 1 });
    return null;
  }
  entry.count++;
  if (entry.count > limit) {
    return NextResponse.json({ error: "יותר מדי בקשות — נסו שוב בעוד דקה" }, { status: 429 });
  }
  return null;
}
