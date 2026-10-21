import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

/**
 * Publish status split by platform for the dashboard —
 * one panel for WhatsApp, one for Facebook.
 */
export async function GET() {
  const [publications, recommendations] = await Promise.all([
    prisma.publication.findMany({
      include: {
        community: { select: { name: true, platform: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    }),
    prisma.recommendation.findMany({
      where: { status: { in: ["pending", "approved"] } },
      include: { community: { select: { platform: true } } },
    }),
  ]);

  const platforms: Record<
    string,
    {
      published: number;
      waiting: number;
      recent: { job: string; jobId: string; community: string; publishedAt: string; notes: string }[];
    }
  > = {
    whatsapp: { published: 0, waiting: 0, recent: [] },
    facebook: { published: 0, waiting: 0, recent: [] },
  };

  for (const p of publications) {
    const key = p.community?.platform ?? p.channel;
    if (!platforms[key]) continue;
    platforms[key].published++;
    if (platforms[key].recent.length < 15) {
      platforms[key].recent.push({
        job: p.job.title,
        jobId: p.job.id,
        community: p.community?.name ?? "-",
        publishedAt: p.publishedAt.toISOString(),
        notes: p.notes ?? "",
      });
    }
  }
  for (const r of recommendations) {
    const key = r.community.platform;
    if (platforms[key]) platforms[key].waiting++;
  }

  const identityFile = path.resolve(".browser/wa-identity.json");
  const capabilityFile = path.resolve(".browser/wa-capabilities.json");
  let capabilities = {
    connected: fs.existsSync(identityFile),
    groupLookup: false,
    uiAutomationReady: false,
    textSendVerified: false,
    mediaSendVerified: false,
  };
  try {
    capabilities = { ...capabilities, ...JSON.parse(fs.readFileSync(capabilityFile, "utf8")) };
  } catch {}

  return NextResponse.json({
    ...platforms,
    whatsappConnection: {
      connected: capabilities.connected,
      groupLookup: capabilities.groupLookup,
      publishReady: capabilities.uiAutomationReady,
      mediaReady: capabilities.uiAutomationReady,
      mode: capabilities.uiAutomationReady ? "chrome-ui" : "not-ready",
    },
  });
}
