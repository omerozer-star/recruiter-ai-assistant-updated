import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AUTOMATION_UNAVAILABLE } from "@/lib/publisher";
import { findWhatsAppCandidates, type WhatsAppCandidate } from "@/lib/whatsapp-sources";
import type { JobAnalysis } from "@/lib/types";

type Preview = { jobId: string; candidates: WhatsAppCandidate[]; expiresAt: number };
type Store = { __waDiscoveryPreviews?: Map<string, Preview> };
const store = globalThis as unknown as Store;
if (!store.__waDiscoveryPreviews) store.__waDiscoveryPreviews = new Map();

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "המשרה לא נמצאה" }, { status: 404 });
  if (!job.analysis) return NextResponse.json({ error: "למשרה אין ניתוח AI" }, { status: 400 });

  if (body.action === "preview") {
    const result = await findWhatsAppCandidates(
      { title: job.title, location: job.location, seniority: job.seniority },
      JSON.parse(job.analysis) as JobAnalysis,
      5
    );
    const previewId = `wap${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    store.__waDiscoveryPreviews!.set(previewId, {
      jobId: id,
      candidates: result.candidates,
      expiresAt: Date.now() + 30 * 60_000,
    });
    return NextResponse.json({ previewId, ...result });
  }

  if (body.action !== "join") {
    return NextResponse.json({ error: "פעולה לא תקינה" }, { status: 400 });
  }
  // Joining groups depends on browser automation utilities not included in this repository
  return NextResponse.json({ error: AUTOMATION_UNAVAILABLE }, { status: 501 });
}

export async function GET() {
  return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
}
