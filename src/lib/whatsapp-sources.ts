import { prisma } from "@/lib/db";
import type { JobAnalysis } from "@/lib/types";

export type WhatsAppSourceDefinition = {
  id: string;
  name: string;
  url: string;
  feedUrl?: string;
  kind: "google_sheet" | "html";
  approved: boolean;
  userProvided: boolean;
};

// Intentionally empty in the public template. Add only sources you own or
// have permission to read, and review their terms before enabling discovery.
export const WHATSAPP_SOURCES: WhatsAppSourceDefinition[] = [];

export type WhatsAppCandidate = {
  id: string;
  name: string;
  category: string;
  region: string;
  info: string;
  inviteUrl: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  score: number;
  reasons: string[];
};

export type WhatsAppSourceRecord = {
  id: string;
  name: string;
  url: string;
  kind: string;
  approved: boolean;
  userProvided: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function ensureWhatsAppSources() {
  for (const source of WHATSAPP_SOURCES) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO CommunitySource (id, name, url, kind, approved, userProvided, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         url = excluded.url,
         kind = excluded.kind,
         userProvided = excluded.userProvided,
         approved = CASE WHEN excluded.userProvided = 1 THEN 1 ELSE CommunitySource.approved END,
         updatedAt = CURRENT_TIMESTAMP`,
      source.id,
      source.name,
      source.url,
      source.kind,
      source.approved ? 1 : 0,
      source.userProvided ? 1 : 0
    );
  }
  return prisma.$queryRawUnsafe<WhatsAppSourceRecord[]>(
    `SELECT id, name, url, kind, approved, userProvided, createdAt, updatedAt
     FROM CommunitySource ORDER BY userProvided DESC, name ASC`
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function cleanInviteUrl(value: string): string {
  const match = value.match(/https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9_-]{15,})/i);
  return match ? `https://chat.whatsapp.com/${match[1]}` : "";
}

function decodeHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "RecruiterAssistant/1.0 (+source review; read-only)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`המקור החזיר שגיאה ${response.status}`);
  return response.text();
}

async function readSource(source: WhatsAppSourceDefinition) {
  if (source.kind === "google_sheet") {
    if (!source.feedUrl) throw new Error(`Missing CSV feed URL for source ${source.id}`);
    const rows = parseCsv(await fetchText(source.feedUrl));
    const headerIndex = rows.findIndex((row) => row[0] === "תחום" && row[1] === "שם הקבוצה");
    return rows.slice(headerIndex + 1).flatMap((row) => {
      const inviteUrl = cleanInviteUrl(row[3] ?? "");
      if (!inviteUrl || !row[1]) return [];
      return [{ name: row[1], category: row[0] ?? "", region: row[2] ?? "", inviteUrl, info: row[4] ?? "" }];
    });
  }

  const html = await fetchText(source.url);
  const matches = [...html.matchAll(/https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{15,}/gi)];
  return matches.flatMap((match, index) => {
    const inviteUrl = cleanInviteUrl(match[0]);
    if (!inviteUrl) return [];
    const start = Math.max(0, (match.index ?? 0) - 350);
    const end = Math.min(html.length, (match.index ?? 0) + match[0].length + 180);
    const context = decodeHtml(html.slice(start, end));
    const name = context.slice(0, 140) || `קבוצת WhatsApp ${index + 1}`;
    return [{ name, category: "דרושים", region: "ישראל", inviteUrl, info: "" }];
  });
}

const DOMAIN_TERMS: Record<string, string[]> = {
  data: ["דאטה", "נתונים", "אנליסט", "analytics", "data", "bi", "dwh"],
  frontend: ["frontend", "front end", "פרונט", "פיתוח", "תוכנה"],
  backend: ["backend", "back end", "בקאנד", "פיתוח", "תוכנה"],
  fullstack: ["fullstack", "full stack", "פולסטאק", "פיתוח", "תוכנה"],
  devops: ["devops", "cloud", "ענן", "תשתיות", "sre"],
  qa: ["qa", "בדיקות", "אוטומציה", "quality"],
  ai: ["ai", "בינה מלאכותית", "machine learning", "ml", "data"],
  security: ["סייבר", "אבטחת מידע", "cyber", "security"],
  product: ["מוצר", "product"],
  sales: ["מכירות", "sales", "שיווק", "marketing"],
  hr: ["משאבי אנוש", "גיוס", "hr", "recruiting"],
  general: ["דרושים", "משרות", "קריירה"],
};

function normalize(value: string) {
  return value.toLocaleLowerCase("he-IL").replace(/[\u200e\u200f\u2066-\u2069]/g, " ");
}

function scoreCandidate(
  candidate: Omit<WhatsAppCandidate, "id" | "sourceId" | "sourceName" | "sourceUrl" | "score" | "reasons">,
  job: { title: string; location: string; seniority: string },
  analysis: JobAnalysis
) {
  const text = normalize(`${candidate.category} ${candidate.name} ${candidate.region} ${candidate.info}`);
  const domain = normalize(analysis.domain);
  const domainTerms = [domain, ...(DOMAIN_TERMS[domain] ?? [])].filter((term) => term.length >= 2);
  const jobTerms = [job.title, ...analysis.technologies, ...analysis.keywords]
    .flatMap((term) => normalize(term).split(/[^\p{L}\p{N}+#.]+/u))
    .filter((term) => term.length >= 3);
  const domainHits = [...new Set(domainTerms.filter((term) => text.includes(term)))];
  const keywordHits = [...new Set(jobTerms.filter((term) => text.includes(term)))];
  let score = domainHits.length * 18 + Math.min(keywordHits.length, 5) * 9;
  const reasons: string[] = [];
  if (domainHits.length) reasons.push(`תחום מתאים: ${domainHits.slice(0, 3).join(", ")}`);
  if (keywordHits.length) reasons.push(`מילות מפתח: ${keywordHits.slice(0, 4).join(", ")}`);
  if (/דרושים|משרות|jobs?|קריירה|חיפוש עבודה/.test(text)) {
    score += 14;
    reasons.push("הקבוצה מיועדת למשרות");
  } else if (/התייעצות|נטוורקינג|networking|קהילה מקצועית/.test(text)) {
    score -= 18;
  } else if (/הייטק|טק|tech/.test(text)) score += 5;
  const location = normalize(job.location || "");
  if (location && location.length >= 2 && text.includes(location)) {
    score += 12;
    reasons.push(`אזור מתאים: ${candidate.region}`);
  }
  const seniority = normalize(`${job.seniority} ${analysis.seniority}`);
  if ((/junior|ג.?וניור|ללא ניסיון/.test(seniority) && /junior|ג.?וניור|ללא ניסיון|סטודנט/.test(text)) ||
      (/senior|lead|בכיר|מנוס/.test(seniority) && /senior|בכיר|מנוס|ניהול/.test(text))) {
    score += 10;
    reasons.push("רמת הניסיון מתאימה");
  }
  if (!reasons.length) reasons.push("קבוצת דרושים כללית");
  return { score: Math.max(0, Math.min(score, 100)), reasons };
}

export async function findWhatsAppCandidates(
  job: { title: string; location: string; seniority: string },
  analysis: JobAnalysis,
  limit = 5
) {
  const dbSources = await ensureWhatsAppSources();
  const approvedIds = new Set(dbSources.filter((source) => source.approved).map((source) => source.id));
  const known = await prisma.$queryRawUnsafe<{ inviteUrl: string }[]>(
    `SELECT inviteUrl FROM Community WHERE platform = 'whatsapp'`
  );
  const knownInvites = new Set(known.map((community) => cleanInviteUrl(community.inviteUrl || "")).filter(Boolean));
  const candidates: WhatsAppCandidate[] = [];
  const warnings: string[] = [];

  for (const source of WHATSAPP_SOURCES.filter((item) => approvedIds.has(item.id))) {
    try {
      const rows = await readSource(source);
      for (const row of rows) {
        if (knownInvites.has(row.inviteUrl)) continue;
        const ranked = scoreCandidate(row, job, analysis);
        candidates.push({
          ...row,
          id: `${source.id}:${row.inviteUrl.split("/").pop()}`,
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: source.url,
          ...ranked,
        });
      }
    } catch (error) {
      warnings.push(`${source.name}: ${error instanceof Error ? error.message : "הקריאה נכשלה"}`);
    }
  }

  const unique = new Map<string, WhatsAppCandidate>();
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "he"))) {
    if (!unique.has(candidate.inviteUrl)) unique.set(candidate.inviteUrl, candidate);
  }
  return { candidates: [...unique.values()].slice(0, Math.min(limit, 5)), warnings };
}

export function sourceDefinition(id: string) {
  return WHATSAPP_SOURCES.find((source) => source.id === id);
}
