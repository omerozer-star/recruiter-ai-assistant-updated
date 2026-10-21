import type { Community } from "@prisma/client";
import type { JobAnalysis } from "./types";

export type ScoredCommunity = {
  communityId: string;
  score: number;
  reasons: string[];
};

/**
 * Deterministic 0-100 match score between a job's analysis and a community.
 * Weights: tag overlap 45, domain 20, past success 15, activity 10, seniority 10.
 */
export function scoreCommunity(analysis: JobAnalysis, community: Community): ScoredCommunity {
  const reasons: string[] = [];
  let score = 0;

  const tags: string[] = safeTags(community.tags).map((t) => t.toLowerCase());
  const jobTerms = new Set(
    [...analysis.technologies, ...analysis.keywords, analysis.domain]
      .map((t) => t.toLowerCase())
  );

  // 1. Tag overlap (up to 45)
  const matched = tags.filter((tag) =>
    [...jobTerms].some((term) => term.includes(tag) || tag.includes(term))
  );
  if (tags.length > 0 && matched.length > 0) {
    const ratio = matched.length / Math.min(tags.length, 6);
    score += Math.round(Math.min(ratio, 1) * 45);
    reasons.push(`חפיפה בטכנולוגיות/נושאים: ${matched.slice(0, 5).join(", ")}`);
  }

  // 1b. Group NAME contains a job keyword (up to 12) — direct title match
  const nameLower = community.name.toLowerCase();
  const nameHits = [...jobTerms].filter((term) => term.length >= 2 && nameLower.includes(term));
  if (nameHits.length > 0) {
    score += Math.min(nameHits.length * 6, 12);
    reasons.push(`שם הקבוצה מכיל מילות מפתח מהמשרה: ${nameHits.slice(0, 3).join(", ")}`);
  }

  // 2. Domain match (20)
  const cDomain = community.domain.toLowerCase();
  const jDomain = analysis.domain.toLowerCase();
  if (cDomain === jDomain) {
    score += 20;
    reasons.push(`הקהילה ממוקדת בתחום ${community.domain}`);
  } else if (cDomain === "general") {
    score += 8;
    reasons.push("קהילה כללית — חשיפה רחבה אך פחות ממוקדת");
  }

  // 2b. Broad-affinity rules (user: any data/BI/hightech group is relevant for tech jobs)
  const nameL = community.name.toLowerCase();
  if (jDomain === "data" && /data|דאטה|דאטא|\bbi\b|analyst|אנליסט/.test(nameL)) {
    score += 25;
    reasons.push("קבוצת דאטה/BI — רלוונטית ישירות לתחום המשרה");
  }
  if (/הייטק|היי-טק|היי טק|high\s?-?tech|hi-?tech|hitech|משרות טק|טק:/.test(nameL)) {
    score += 18;
    reasons.push("קבוצת הייטק כללית — רלוונטית לכל משרה טכנולוגית");
  }

  // 3. Past success (up to 15) — learning system
  if (community.successScore > 0) {
    score += Math.round(Math.min(community.successScore, 1) * 15);
    reasons.push(`הצלחות עבר: ${(community.successScore * 100).toFixed(0)}% אפקטיביות בפרסומים קודמים`);
  }

  // 4. Activity level (up to 10)
  score += community.activityLevel * 2;
  if (community.activityLevel >= 4) {
    reasons.push("קהילה פעילה מאוד");
  }

  // 4b. Membership bonus (5) — groups the configured account already belongs to are immediately available
  if (community.membership === "member") {
    score += 5;
    reasons.push("החשבון חבר בקבוצה — אפשר לפרסם מיד");
  }

  // 5. Seniority fit (up to 10)
  if (community.seniority === "all" || analysis.seniority === "any") {
    score += 7;
  } else if (community.seniority === analysis.seniority) {
    score += 10;
    reasons.push(`מתאימה במיוחד לרמת ${analysis.seniority}`);
  } else {
    reasons.push(`שימו לב: הקהילה מיועדת ל-${community.seniority}, המשרה ברמת ${analysis.seniority}`);
  }

  return { communityId: community.id, score: Math.min(score, 100), reasons };
}

/** Communities are excluded only through the explicit database flag. */
export function isExcluded(community: Community): boolean {
  return community.excluded;
}

export function recommendCommunities(
  analysis: JobAnalysis,
  communities: Community[],
  { minScore = 30, limit = 60 } = {}
): ScoredCommunity[] {
  // canPost=false → announcement-only group (only admins may send) — pointless to recommend
  const eligible = communities.filter((c) => !isExcluded(c) && c.canPost);
  const pinnedIds = new Set(eligible.filter((c) => c.pinned).map((c) => c.id));

  const scored = eligible
    .map((c) => scoreCommunity(analysis, c))
    .map((s) =>
      pinnedIds.has(s.communityId)
        ? { ...s, reasons: ["📌 קבוצה קבועה — מסומנת לפרסום בכל משרה", ...s.reasons] }
        : s
    )
    // pinned groups always pass the score threshold
    .filter((s) => s.score >= minScore || pinnedIds.has(s.communityId))
    .sort((a, b) => b.score - a.score);

  // top N, but pinned groups are never dropped by the limit
  const top = scored.slice(0, limit);
  for (const s of scored.slice(limit)) if (pinnedIds.has(s.communityId)) top.push(s);
  return top;
}

export function safeTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
