import { prisma } from "@/lib/db";

/**
 * Shared publish core — used by /api/publish-auto (single group) and
 * /api/publish-batch (server-side batch). Browser automation utilities are not
 * included in this repository, so publishing always falls back to manual mode.
 */
export const AUTOMATION_UNAVAILABLE = "כלי האוטומציה לפייסבוק ול-WhatsApp אינם כלולים בגרסה זו";

export type PublishOutcome = {
  ok: boolean;
  publicationId?: string;
  fallback?: boolean;
  error?: string;
};

export async function publishOne(
  jobId: string,
  communityId: string,
  opts: { force?: boolean } = {}
): Promise<PublishOutcome> {
  const [community, job] = await Promise.all([
    prisma.community.findUnique({ where: { id: communityId } }),
    prisma.job.findUnique({ where: { id: jobId } }),
  ]);
  if (!community) return { ok: false, error: "הקבוצה לא נמצאה" };
  if (!job) return { ok: false, error: "המשרה לא נמצאה" };

  // RED LINE: discreet jobs publish ONLY from the discreet FB profile's groups,
  // and regular jobs must never publish through the discreet profile.
  const requiredProfile = job.discreet ? "discreet" : "main";
  if (community.fbProfile !== requiredProfile) {
    return {
      ok: false,
      error: job.discreet
        ? "משרה דיסקרטית מתפרסמת רק בקבוצות של הפרופיל הדיסקרטי"
        : "קבוצה של הפרופיל הדיסקרטי — לא זמינה למשרות רגילות",
    };
  }

  const [post, rec] = await Promise.all([
    prisma.post.findFirst({ where: { jobId, channel: community.platform } }),
    prisma.recommendation.findFirst({ where: { jobId, communityId } }),
  ]);
  if (!post) return { ok: false, error: "אין פוסט לערוץ הזה — צרו פוסטים קודם" };
  if (rec && rec.status !== "approved" && rec.status !== "published") {
    return { ok: false, error: "הקבוצה טרם אושרה לפרסום" };
  }
  // Duplicate guard — bypassed only by an explicit "publish again" request
  if (!opts.force) {
    const existing = await prisma.publication.findFirst({ where: { jobId, communityId } });
    if (existing) return { ok: false, error: "המשרה כבר פורסמה בקבוצה הזו" };
  }

  return { ok: false, fallback: true, error: AUTOMATION_UNAVAILABLE };
}
