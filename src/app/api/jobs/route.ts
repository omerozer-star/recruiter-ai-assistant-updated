import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJob } from "@/lib/claude";
import { recommendCommunities } from "@/lib/matching";
import type { JobInput } from "@/lib/types";
import { isHttpUrlOrEmpty, rateLimited, tooLong } from "@/lib/validation";

export async function GET() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { recommendations: true, posts: true, publications: true } },
    },
  });
  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  const limited = rateLimited("ai:jobs");
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as JobInput;
  if (typeof body.title !== "string" || typeof body.description !== "string" || !body.title.trim() || !body.description.trim()) {
    return NextResponse.json({ error: "שם משרה ותיאור הם שדות חובה" }, { status: 400 });
  }
  const invalid = tooLong(body, {
    title: 200, company: 200, sourceUrl: 2000, description: 20000, requirements: 10000,
    advantages: 10000, location: 200, employmentType: 100, seniority: 100,
  });
  if (invalid) return invalid;
  if (!isHttpUrlOrEmpty(body.sourceUrl)) {
    return NextResponse.json({ error: "קישור להגשת קו״ח חייב להיות כתובת http/https" }, { status: 400 });
  }

  const job = await prisma.job.create({
    data: {
      title: body.title.trim(),
      company: body.company?.trim() ?? "",
      sourceUrl: body.sourceUrl?.trim() ?? "",
      description: body.description.trim(),
      requirements: body.requirements?.trim() ?? "",
      advantages: body.advantages?.trim() ?? "",
      location: body.location?.trim() ?? "",
      employmentType: body.employmentType?.trim() ?? "",
      seniority: body.seniority?.trim() ?? "",
      discreet: body.discreet === true,
    },
  });

  // AI analysis (Claude, with demo fallback when no API key)
  const analysis = await analyzeJob(body);

  // Community matching — discreet jobs only match groups of the separate
  // discreet Facebook profile; regular jobs never see those groups.
  const all = await prisma.community.findMany();
  const communities = job.discreet
    ? all.filter((c) => c.platform === "facebook" && c.fbProfile === "discreet")
    : all.filter((c) => c.fbProfile === "main");
  const scored = recommendCommunities(analysis, communities);

  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { analysis: JSON.stringify(analysis) },
    }),
    ...scored.map((s) =>
      prisma.recommendation.create({
        data: {
          jobId: job.id,
          communityId: s.communityId,
          score: s.score,
          reasons: JSON.stringify(s.reasons),
        },
      })
    ),
  ]);

  return NextResponse.json({ id: job.id }, { status: 201 });
}
