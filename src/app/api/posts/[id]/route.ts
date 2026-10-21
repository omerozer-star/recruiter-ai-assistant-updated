import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Images are served from public/ only — no external URLs or path traversal
const IMAGE_PATH = /^public\/[A-Za-z0-9_\-/]+\.(png|jpe?g|webp|gif)$/i;

type Params = { params: Promise<{ id: string }> };

/** Edit a generated post's text before publishing. */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { content?: string; imagePath?: string } = {};
  if (body.content !== undefined) {
    const content = String(body.content).trim();
    if (!content) return NextResponse.json({ error: "תוכן הפוסט לא יכול להיות ריק" }, { status: 400 });
    if (content.length > 10000) return NextResponse.json({ error: "תוכן הפוסט ארוך מדי" }, { status: 400 });
    data.content = content;
  }
  if (body.imagePath !== undefined) {
    const imagePath = String(body.imagePath).trim();
    if (imagePath && (!IMAGE_PATH.test(imagePath) || imagePath.includes(".."))) {
      return NextResponse.json({ error: "נתיב תמונה לא תקין (רק קבצים מתוך public/)" }, { status: 400 });
    }
    data.imagePath = imagePath;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "לא נשלחו שינויים" }, { status: 400 });
  }
  const post = await prisma.post.update({ where: { id }, data });
  return NextResponse.json(post);
}
