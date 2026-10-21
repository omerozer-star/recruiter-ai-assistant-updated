import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLATFORMS } from "@/lib/validation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.jobId !== "string" || !PLATFORMS.includes(body.channel)) {
    return NextResponse.json({ error: "jobId ו-channel הם שדות חובה" }, { status: 400 });
  }
  if (body.communityId != null && typeof body.communityId !== "string") {
    return NextResponse.json({ error: "communityId לא תקין" }, { status: 400 });
  }

  const publication = await prisma.publication.create({
    data: {
      jobId: body.jobId,
      communityId: body.communityId ?? null,
      channel: body.channel,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 5000) : "",
    },
  });

  // First publication moves the campaign to "published"
  await prisma.job.updateMany({
    where: { id: body.jobId, status: { in: ["draft", "approved"] } },
    data: { status: "published" },
  });

  // Mark the matching recommendation as published
  if (body.communityId) {
    await prisma.recommendation.updateMany({
      where: { jobId: body.jobId, communityId: body.communityId },
      data: { status: "published" },
    });
  }

  return NextResponse.json(publication, { status: 201 });
}
