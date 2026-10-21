import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toInt } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/**
 * Record results for a publication (candidates received / relevant / hired)
 * and update the community's successScore — the learning system.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const publication = await prisma.publication.update({
    where: { id },
    data: {
      candidatesTotal: toInt(body.candidatesTotal, 0, 1_000_000),
      candidatesRelevant: toInt(body.candidatesRelevant, 0, 1_000_000),
      hired: toInt(body.hired, 0, 1_000_000),
      notes: typeof body.notes === "string" ? body.notes.slice(0, 5000) : "",
    },
  });

  // Campaign starts "receiving candidates" once results come in
  if (publication.candidatesTotal > 0) {
    await prisma.job.updateMany({
      where: { id: publication.jobId, status: "published" },
      data: { status: "receiving" },
    });
  }

  // Learning system: recompute the community's success score from all its publications
  if (publication.communityId) {
    const pubs = await prisma.publication.findMany({
      where: { communityId: publication.communityId, candidatesTotal: { gt: 0 } },
    });
    const totals = pubs.reduce(
      (acc, p) => ({
        total: acc.total + p.candidatesTotal,
        relevant: acc.relevant + p.candidatesRelevant,
        hired: acc.hired + p.hired,
      }),
      { total: 0, relevant: 0, hired: 0 }
    );
    if (totals.total > 0) {
      const relevanceRatio = totals.relevant / totals.total; // 0-1
      const hireBonus = Math.min(totals.hired, 3) / 3; // 0-1
      const successScore = Math.min(relevanceRatio * 0.8 + hireBonus * 0.2, 1);
      await prisma.community.update({
        where: { id: publication.communityId },
        data: { successScore },
      });
    }
  }

  return NextResponse.json(publication);
}
