import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureWhatsAppSources, sourceDefinition } from "@/lib/whatsapp-sources";

export async function GET() {
  return NextResponse.json(await ensureWhatsAppSources());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const source = typeof body.sourceId === "string" ? sourceDefinition(body.sourceId) : undefined;
  if (!source) return NextResponse.json({ error: "המקור לא נמצא" }, { status: 404 });
  if (source.userProvided && body.approved === false) {
    return NextResponse.json({ error: "המקור שסיפקת הוא מקור הבסיס ואי אפשר להשבית אותו כאן" }, { status: 400 });
  }
  await ensureWhatsAppSources();
  await prisma.$executeRawUnsafe(
    `UPDATE CommunitySource SET approved = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    body.approved === true ? 1 : 0,
    source.id
  );
  const [updated] = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM CommunitySource WHERE id = ?`,
    source.id
  );
  return NextResponse.json(updated);
}
