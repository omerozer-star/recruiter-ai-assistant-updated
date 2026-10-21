import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishOne } from "@/lib/publisher";

/**
 * Server-side batch publish: receives the communities the recruiter marked,
 * publishes Facebook first then WhatsApp, one at a time, in the background.
 * The batch keeps running even if the browser tab is refreshed or closed —
 * the UI polls GET ?id=<batchId> for live progress.
 * Marking the groups + clicking the batch button IS the explicit approval.
 */
type BatchResult = { communityId: string; name: string; ok: boolean; note: string };
type BatchProgress = {
  running: boolean;
  total: number;
  done: number;
  current: string;
  results: BatchResult[];
};

const g = globalThis as unknown as { __publishBatches?: Map<string, BatchProgress> };
if (!g.__publishBatches) g.__publishBatches = new Map();

export async function POST(req: Request) {
  const body = await req.json();
  const { jobId, communityIds } = body;
  if (!jobId || !Array.isArray(communityIds) || communityIds.length === 0) {
    return NextResponse.json({ error: "jobId ו-communityIds הם שדות חובה" }, { status: 400 });
  }

  const communities = await prisma.community.findMany({ where: { id: { in: communityIds } } });
  if (communities.length === 0) {
    return NextResponse.json({ error: "לא נמצאו קבוצות" }, { status: 404 });
  }

  // The recruiter explicitly marked these groups — that is the approval
  await prisma.recommendation.updateMany({
    where: { jobId, communityId: { in: communityIds }, status: "pending" },
    data: { status: "approved" },
  });

  // Facebook first, then WhatsApp
  const order: Record<string, number> = { facebook: 0, whatsapp: 1 };
  const sorted = [...communities].sort(
    (a, b) => (order[a.platform] ?? 2) - (order[b.platform] ?? 2)
  );

  const batchId = `b${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const progress: BatchProgress = {
    running: true,
    total: sorted.length,
    done: 0,
    current: "",
    results: [],
  };
  g.__publishBatches!.set(batchId, progress);

  // Fire and forget — publishOne serializes browser use via the shared queue
  (async () => {
    for (const community of sorted) {
      progress.current = community.name;
      try {
        const r = await publishOne(jobId, community.id);
        progress.results.push({
          communityId: community.id,
          name: community.name,
          ok: r.ok,
          note: r.ok
            ? "פורסם אוטומטית"
            : r.fallback
              ? `דורש פרסום ידני — ${r.error ?? ""}`
              : (r.error ?? "שגיאה"),
        });
      } catch (e) {
        progress.results.push({
          communityId: community.id,
          name: community.name,
          ok: false,
          note: e instanceof Error ? e.message : "שגיאה",
        });
      }
      progress.done = progress.results.length;
    }
    progress.running = false;
    progress.current = "";
  })();

  return NextResponse.json({ batchId, total: sorted.length });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const progress = id ? g.__publishBatches!.get(id) : undefined;
  if (!progress) return NextResponse.json({ error: "batch לא נמצא" }, { status: 404 });
  return NextResponse.json(progress);
}
