import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      recommendations: {
        include: { community: true },
        orderBy: { score: "desc" },
      },
      posts: { orderBy: { createdAt: "desc" } },
      publications: { include: { community: true }, orderBy: { publishedAt: "desc" } },
    },
  });
  if (!job) return NextResponse.json({ error: "המשרה לא נמצאה" }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["draft", "approved", "published", "receiving"];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: "סטטוס לא תקין" }, { status: 400 });
  }
  const job = await prisma.job.update({ where: { id }, data: { status: body.status } });
  return NextResponse.json(job);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await prisma.job.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
