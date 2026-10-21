export type JobAnalysis = {
  domain: string;
  technologies: string[];
  seniority: "junior" | "mid" | "senior" | "lead" | "any";
  targetAudiences: string[];
  keywords: string[];
  summary: string;
  source: "claude" | "demo";
};

export type GeneratedPosts = {
  linkedin: string;
  facebook: string;
  whatsapp: string;
};

export type JobInput = {
  title: string;
  company?: string;
  sourceUrl?: string;
  description: string;
  requirements?: string;
  advantages?: string;
  location?: string;
  employmentType?: string;
  seniority?: string;
  discreet?: boolean; // discreet job: posts must never name the company or location
};

export const CHANNEL_LABELS: Record<string, string> = {
  facebook: "פייסבוק",
  whatsapp: "וואטסאפ",
  linkedin: "לינקדאין",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  approved: "מאושר",
  published: "פורסם",
  receiving: "מקבל מועמדים",
};

/** JSON.parse that never throws: returns `fallback` for empty or malformed input. */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Parse a JSON-encoded string array stored in the database (tags, reasons). */
export function parseJsonArray(value: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}
