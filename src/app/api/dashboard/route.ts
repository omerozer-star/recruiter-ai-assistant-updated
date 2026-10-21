import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [jobs, publications] = await Promise.all([
    prisma.job.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.publication.findMany({ include: { community: true } }),
  ]);

  const totals = publications.reduce(
    (acc, p) => ({
      candidates: acc.candidates + p.candidatesTotal,
      relevant: acc.relevant + p.candidatesRelevant,
      hired: acc.hired + p.hired,
    }),
    { candidates: 0, relevant: 0, hired: 0 }
  );

  // Per-channel aggregation
  const channels: Record<string, { publications: number; candidates: number; relevant: number }> = {};
  for (const p of publications) {
    channels[p.channel] ??= { publications: 0, candidates: 0, relevant: 0 };
    channels[p.channel].publications += 1;
    channels[p.channel].candidates += p.candidatesTotal;
    channels[p.channel].relevant += p.candidatesRelevant;
  }

  // Top communities by relevant candidates
  const byCommunity: Record<string, { name: string; platform: string; candidates: number; relevant: number }> = {};
  for (const p of publications) {
    if (!p.community) continue;
    byCommunity[p.community.id] ??= {
      name: p.community.name,
      platform: p.community.platform,
      candidates: 0,
      relevant: 0,
    };
    byCommunity[p.community.id].candidates += p.candidatesTotal;
    byCommunity[p.community.id].relevant += p.candidatesRelevant;
  }
  const topCommunities = Object.values(byCommunity)
    .sort((a, b) => b.relevant - a.relevant || b.candidates - a.candidates)
    .slice(0, 5);

  return NextResponse.json({
    activeJobs: jobs.filter((j) => j.status !== "draft").length,
    totalJobs: jobs.length,
    totalPublications: publications.length,
    ...totals,
    conversionRate: totals.candidates > 0 ? totals.relevant / totals.candidates : 0,
    channels,
    topCommunities,
    recentJobs: jobs.slice(0, 5).map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      createdAt: j.createdAt,
    })),
    aiMode: process.env.ANTHROPIC_API_KEY ? "claude" : "demo",
  });
}
