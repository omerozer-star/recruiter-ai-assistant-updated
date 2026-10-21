import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/** Global approval — approve every pending recommended group for this job. */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const result = await prisma.recommendation.updateMany({
    where: { jobId: id, status: "pending" },
    data: { status: "approved" },
  });
  return NextResponse.json({ approved: result.count });
}
