import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isHttpUrlOrEmpty, PLATFORMS, SENIORITIES, toInt, tooLong } from "@/lib/validation";

export async function GET() {
  const communities = await prisma.community.findMany({
    orderBy: [{ platform: "asc" }, { name: "asc" }],
    include: { _count: { select: { publications: true } } },
  });
  return NextResponse.json(communities);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.name !== "string" || typeof body.domain !== "string" || !body.name.trim() || !body.domain.trim()) {
    return NextResponse.json({ error: "שם, פלטפורמה ותחום הם שדות חובה" }, { status: 400 });
  }
  if (!PLATFORMS.includes(body.platform)) {
    return NextResponse.json({ error: "פלטפורמה לא תקינה" }, { status: 400 });
  }
  const seniority = body.seniority ?? "all";
  if (!SENIORITIES.includes(seniority)) {
    return NextResponse.json({ error: "רמת בכירות לא תקינה" }, { status: 400 });
  }
  // Only http(s) links — blocks javascript:/data: URLs that would later be opened from the UI
  if (!isHttpUrlOrEmpty(body.url)) {
    return NextResponse.json({ error: "קישור הקבוצה חייב להיות כתובת http/https" }, { status: 400 });
  }
  const invalid = tooLong(body, { name: 200, url: 2000, domain: 100, contactName: 200, notes: 5000 });
  if (invalid) return invalid;
  const tags: string[] = Array.isArray(body.tags)
    ? body.tags.filter((t: unknown): t is string => typeof t === "string").slice(0, 30)
    : String(body.tags ?? "")
        .split(",")
        .map((t: string) => t.trim().toLowerCase())
        .filter(Boolean);

  const community = await prisma.community.create({
    data: {
      name: body.name.trim(),
      platform: body.platform,
      url: body.url?.trim() ?? "",
      domain: body.domain.trim(),
      tags: JSON.stringify(tags),
      seniority,
      activityLevel: Math.max(toInt(body.activityLevel, 3, 5), 1),
      memberCount: toInt(body.memberCount, 0, 10_000_000),
      contactName: typeof body.contactName === "string" ? body.contactName.trim() : "",
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
    },
  });
  return NextResponse.json(community, { status: 201 });
}
