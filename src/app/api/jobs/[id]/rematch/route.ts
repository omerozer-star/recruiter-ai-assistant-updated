import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recommendCommunities } from "@/lib/matching";
import type { JobAnalysis } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Recompute community recommendations (e.g. after new groups were imported). Keeps published rows. */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job?.analysis) return NextResponse.json({ error: "אין ניתוח למשרה" }, { status: 400 });

  const analysis = JSON.parse(job.analysis) as JobAnalysis;
  const all = await prisma.community.findMany();
  // Discreet jobs only match the discreet FB profile's groups; regular jobs never see those
  const communities = job.discreet
    ? all.filter((c) => c.platform === "facebook" && c.fbProfile === "discreet")
    : all.filter((c) => c.fbProfile === "main");
  const scored = recommendCommunities(analysis, communities);

  const keep = await prisma.recommendation.findMany({
    where: { jobId: id, status: "published" },
    select: { communityId: true },
  });
  const keepIds = new Set(keep.map((k) => k.communityId));

  await prisma.recommendation.deleteMany({ where: { jobId: id, status: { not: "published" } } });
  const created = await prisma.$transaction(
    scored
      .filter((s) => !keepIds.has(s.communityId))
      .map((s) =>
        prisma.recommendation.create({
          data: { jobId: id, communityId: s.communityId, score: s.score, reasons: JSON.stringify(s.reasons) },
        })
      )
  );
  return NextResponse.json({ recommendations: created.length });
}
