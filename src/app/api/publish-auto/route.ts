import { NextResponse } from "next/server";
import { publishOne } from "@/lib/publisher";

/**
 * Automatic publishing of a single group from the recruiter's own connected
 * accounts (pinned Facebook profile / dedicated WhatsApp number).
 * Only ever called after an explicit approve + publish click in the UI.
 * The heavy lifting lives in src/lib/publisher.ts, shared with /api/publish-batch.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { jobId, communityId, force } = body;
  if (!jobId || !communityId) {
    return NextResponse.json({ error: "jobId ו-communityId הם שדות חובה" }, { status: 400 });
  }

  const result = await publishOne(jobId, communityId, { force: force === true });

  if (result.ok) {
    return NextResponse.json({ ok: true, publicationId: result.publicationId });
  }
  if (result.fallback) {
    return NextResponse.json(
      { ok: false, fallback: true, reason: result.error ?? "שגיאה לא ידועה" },
      { status: 502 }
    );
  }
  const status = result.error === "המשרה כבר פורסמה בקבוצה הזו" ? 409 : 400;
  return NextResponse.json({ error: result.error }, { status });
}
