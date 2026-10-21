import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { GeneratedPosts, JobAnalysis, JobInput } from "./types";

// claude-haiku-4-5: fastest and cheapest. Does not accept `thinking: adaptive`
// (that's a 4.6+ feature), so requests below pass no thinking param.
const MODEL = "claude-haiku-4-5";

const analysisSchema = z.object({
  domain: z
    .string()
    .describe("תחום המשרה באנגלית, למשל: Data, Frontend, Backend, DevOps, QA, Fullstack, AI, Security, Product, General"),
  technologies: z.array(z.string()).describe("טכנולוגיות וכלים רלוונטיים, באנגלית באותיות קטנות"),
  seniority: z.enum(["junior", "mid", "senior", "lead", "any"]),
  targetAudiences: z.array(z.string()).describe("קהלי יעד — תפקידים של מועמדים פוטנציאליים"),
  keywords: z.array(z.string()).describe("מילות חיפוש לאיתור מועמדים (כותרות תפקיד וכישורים)"),
  summary: z.string().describe("סיכום קצר בעברית של פרופיל החיפוש (2-3 משפטים)"),
});

const postsSchema = z.object({
  linkedin: z.string().describe("פוסט לינקדאין בעברית: מקצועי ומפורט, עם תיאור התפקיד, הדרישות המרכזיות והנעה לפעולה"),
  facebook: z.string().describe("פוסט לקבוצת פייסבוק בעברית: קצר, אישי וקהילתי"),
  whatsapp: z.string().describe("הודעת וואטסאפ בעברית: קצרה מאוד (2-4 שורות), עם אימוג'ים, מבקשת חיבורים"),
});

function jobToText(job: JobInput): string {
  // Discreet jobs: company and location must never reach the model, so they
  // can never leak into a generated post.
  return [
    `שם המשרה: ${job.title}`,
    !job.discreet && job.company ? `שם החברה: ${job.company}` : "",
    `תיאור: ${job.description}`,
    job.requirements ? `דרישות חובה: ${job.requirements}` : "",
    job.advantages ? `יתרונות: ${job.advantages}` : "",
    !job.discreet && job.location ? `מיקום: ${job.location}` : "",
    job.employmentType ? `סוג העסקה: ${job.employmentType}` : "",
    job.seniority ? `רמת בכירות: ${job.seniority}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

export async function analyzeJob(job: JobInput): Promise<JobAnalysis> {
  const client = getClient();
  if (!client) return demoAnalysis(job);

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system:
        "אתה עוזר AI למגייסות טכנולוגיה בישראל. נתח את המשרה וייצר פרופיל חיפוש מדויק לסורסינג. " +
        "השדות domain, technologies ו-keywords באנגלית באותיות קטנות; targetAudiences ו-summary בעברית.",
      messages: [{ role: "user", content: jobToText(job) }],
      output_config: { format: zodOutputFormat(analysisSchema) },
    });
    if (!response.parsed_output) return demoAnalysis(job);
    return { ...response.parsed_output, source: "claude" };
  } catch (err) {
    console.error("Claude analyzeJob failed, falling back to demo:", err);
    return demoAnalysis(job);
  }
}

export async function generatePosts(job: JobInput, analysis: JobAnalysis): Promise<GeneratedPosts & { source: "claude" | "demo" }> {
  const client = getClient();
  if (!client) return { ...demoPosts(job, analysis), source: "demo" };

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system:
        "אתה קופירייטר גיוס ישראלי. כתוב שלושה פוסטים בעברית לפרסום משרה, מותאמים לכל ערוץ:\n" +
        "- לינקדאין: מקצועי ומפורט (עד ~150 מילים), פתיח מושך, פירוט תמציתי של התפקיד והדרישות, סיום עם הנעה לפעולה ו-3-5 האשטגים.\n" +
        "- פייסבוק: קצר (עד ~80 מילים), אישי וקהילתי, כאילו נכתב על ידי המגייסת עצמה.\n" +
        "- וואטסאפ: קצר מאוד (2-4 שורות), עם אימוג'ים, מבקש חיבור למועמדים מתאימים.\n" +
        "נסח בלשון רבים/ניטרלית ('אנחנו מחפשים', 'שלחו אלינו', 'אשמח לחיבור' בסדר). " +
        "אל תשתמש בתו מרכאות כפולות (\") בתוך הטקסט — עבור ראשי תיבות השתמש בגרשיים עבריים ״ (למשל תעו״נ, קו״ח). " +
        "אם נמסר שם חברה — הזכר אותו; אם לא — כתוב באופן אנונימי ואל תמציא פרטים שלא נמסרו (שכר, שם חברה וכו')." +
        (job.discreet
          ? "\n\nמשרה דיסקרטית! חל איסור מוחלט לציין: שם חברה, שם מוצר, מיקום גיאוגרפי, או כל פרט שממנו אפשר לזהות את המעסיק. " +
            "כתוב 'חברה מובילה בתחומה' או ניסוח דומה, וציין שפרטים מלאים יימסרו למועמדים מתאימים בשיחה אישית. " +
            "אל תכתוב 'אנחנו ב<שם>' ואל תרמוז על זהות המעסיק בשום דרך."
          : ""),
      messages: [
        {
          role: "user",
          content: `${jobToText(job)}\n\nפרופיל חיפוש: ${JSON.stringify({ domain: analysis.domain, technologies: analysis.technologies, keywords: analysis.keywords })}`,
        },
      ],
      output_config: { format: zodOutputFormat(postsSchema) },
    });
    if (!response.parsed_output) return { ...demoPosts(job, analysis), source: "demo" };
    return { ...response.parsed_output, source: "claude" };
  } catch (err) {
    console.error("Claude generatePosts failed, falling back to demo:", err);
    return { ...demoPosts(job, analysis), source: "demo" };
  }
}

// ---------- Demo fallbacks (work without an API key) ----------

const TECH_KEYWORDS: Record<string, { domain: string; audiences: string[] }> = {
  talend: { domain: "Data", audiences: ["Data Engineers", "ETL Developers"] },
  etl: { domain: "Data", audiences: ["ETL Developers", "Data Engineers"] },
  sql: { domain: "Data", audiences: ["Data Engineers", "BI Developers"] },
  "data warehouse": { domain: "Data", audiences: ["DWH Developers"] },
  dwh: { domain: "Data", audiences: ["DWH Developers"] },
  snowflake: { domain: "Data", audiences: ["Data Engineers"] },
  python: { domain: "Backend", audiences: ["Python Developers"] },
  react: { domain: "Frontend", audiences: ["Frontend Developers"] },
  angular: { domain: "Frontend", audiences: ["Frontend Developers"] },
  vue: { domain: "Frontend", audiences: ["Frontend Developers"] },
  typescript: { domain: "Frontend", audiences: ["Frontend Developers"] },
  javascript: { domain: "Frontend", audiences: ["Frontend Developers"] },
  node: { domain: "Fullstack", audiences: ["Fullstack Developers"] },
  java: { domain: "Backend", audiences: ["Java Developers", "Backend Developers"] },
  spring: { domain: "Backend", audiences: ["Java Developers"] },
  kubernetes: { domain: "DevOps", audiences: ["DevOps Engineers"] },
  docker: { domain: "DevOps", audiences: ["DevOps Engineers"] },
  aws: { domain: "DevOps", audiences: ["DevOps Engineers", "Cloud Engineers"] },
  terraform: { domain: "DevOps", audiences: ["DevOps Engineers"] },
  devops: { domain: "DevOps", audiences: ["DevOps Engineers"] },
  qa: { domain: "QA", audiences: ["QA Engineers", "Automation Engineers"] },
  selenium: { domain: "QA", audiences: ["Automation Engineers"] },
  "machine learning": { domain: "AI", audiences: ["ML Engineers", "Data Scientists"] },
  ml: { domain: "AI", audiences: ["ML Engineers"] },
  ai: { domain: "AI", audiences: ["ML Engineers", "AI Engineers"] },
  cyber: { domain: "Security", audiences: ["Security Engineers"] },
  security: { domain: "Security", audiences: ["Security Engineers"] },
  product: { domain: "Product", audiences: ["Product Managers"] },
};

function demoAnalysis(job: JobInput): JobAnalysis {
  const text = `${job.title} ${job.description} ${job.requirements ?? ""}`.toLowerCase();
  const technologies: string[] = [];
  const audiences = new Set<string>();
  const domainVotes: Record<string, number> = {};

  for (const [kw, meta] of Object.entries(TECH_KEYWORDS)) {
    if (text.includes(kw)) {
      technologies.push(kw);
      meta.audiences.forEach((a) => audiences.add(a));
      domainVotes[meta.domain] = (domainVotes[meta.domain] ?? 0) + 1;
    }
  }

  const domain =
    Object.entries(domainVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "General";

  const s = (job.seniority ?? "").toLowerCase();
  const seniority: JobAnalysis["seniority"] = s.includes("senior") || s.includes("בכיר")
    ? "senior"
    : s.includes("junior") || s.includes("ג'וניור")
      ? "junior"
      : s.includes("lead") || s.includes("ראש צוות")
        ? "lead"
        : "any";

  const keywords = [job.title, ...technologies.map((t) => `${t} developer`)].slice(0, 8);

  return {
    domain,
    technologies,
    seniority,
    targetAudiences: audiences.size ? [...audiences] : ["Software Developers"],
    keywords,
    summary: `פרופיל חיפוש (מצב דמו): משרת ${job.title} בתחום ${domain}. טכנולוגיות מרכזיות: ${technologies.join(", ") || "לא זוהו"}.`,
    source: "demo",
  };
}

function demoPosts(job: JobInput, analysis: JobAnalysis): GeneratedPosts {
  const techs = analysis.technologies.slice(0, 3).join(", ");
  const loc = !job.discreet && job.location ? ` | ${job.location}` : "";
  const co = !job.discreet && job.company ? `ב-${job.company}` : "בחברה מובילה בתחום";
  return {
    linkedin:
      `🚀 מגייסים: ${job.title}${loc}\n\n` +
      `אנחנו מחפשים ${job.title} ${co}, עם ניסיון ב-${techs || "טכנולוגיות רלוונטיות"}.\n\n` +
      `${job.description.slice(0, 200)}\n\n` +
      `נשמע מעניין? שלחו הודעה או קו"ח בפרטי 🙏\n\n` +
      `#hiring #${analysis.domain.toLowerCase()} #israel`,
    facebook:
      `היי חברים! 👋\n` +
      `מחפשים ${job.title}${loc} ${co} — ${techs ? `ניסיון ב-${techs}` : "פרטים בפנים"}.\n` +
      `מכירים מישהו שמתאים? תייגו או שלחו הודעה בפרטי 🙏`,
    whatsapp:
      `מחפשים ${job.title} 🚀\n` +
      `${techs ? `ניסיון ב-${techs} ` : ""}${co}${loc}\n` +
      `מכירים מישהו מתאים? נשמח לחיבור 🙏`,
  };
}

// ---------- Job extraction from a pasted URL ----------

const jobExtractSchema = z.object({
  title: z.string().describe("שם המשרה"),
  company: z.string().describe("שם החברה אם מופיע, אחרת מחרוזת ריקה"),
  description: z.string().describe("תיאור המשרה"),
  requirements: z.string().describe("דרישות חובה, שורה לכל דרישה"),
  advantages: z.string().describe("יתרונות, שורה לכל יתרון"),
  location: z.string(),
  employmentType: z.string(),
  seniority: z.string(),
});

export async function extractJobFromPage(pageText: string): Promise<z.infer<typeof jobExtractSchema> & { source: "claude" | "demo" }> {
  const client = getClient();
  if (!client) return demoExtract(pageText);

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system:
        "חלץ את פרטי המשרה מטקסט של דף אינטרנט. שמור על השפה המקורית של הדף. " +
        "אם שדה לא מופיע בדף — החזר מחרוזת ריקה. אל תמציא מידע.",
      messages: [{ role: "user", content: pageText.slice(0, 20000) }],
      output_config: { format: zodOutputFormat(jobExtractSchema) },
    });
    if (!response.parsed_output) return demoExtract(pageText);
    return { ...response.parsed_output, source: "claude" };
  } catch (err) {
    console.error("Claude extractJobFromPage failed, falling back to demo:", err);
    return demoExtract(pageText);
  }
}

function demoExtract(pageText: string) {
  const lines = pageText.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    title: lines[0]?.slice(0, 80) ?? "",
    company: "",
    description: lines.slice(1).join("\n").slice(0, 1500),
    requirements: "",
    advantages: "",
    location: "",
    employmentType: "",
    seniority: "",
    source: "demo" as const,
  };
}
