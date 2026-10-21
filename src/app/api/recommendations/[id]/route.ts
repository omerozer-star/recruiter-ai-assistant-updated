import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["pending", "approved", "published"];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: "סטטוס לא תקין" }, { status: 400 });
  }
  const rec = await prisma.recommendation.update({
    where: { id },
    data: { status: body.status },
  });
  return NextResponse.json(rec);
}
