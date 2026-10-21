import { NextResponse } from "next/server";
import { extractJobFromPage } from "@/lib/claude";
import { safeFetchText, UnsafeUrlError } from "@/lib/safe-fetch";
import { rateLimited } from "@/lib/validation";

/** Paste a link to an existing job posting → fetch the page → extract job fields. */
export async function POST(req: Request) {
  const limited = rateLimited("ai:import");
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\//i.test(url) || url.length > 2000) {
    return NextResponse.json({ error: "יש להזין כתובת אינטרנט תקינה (http/https)" }, { status: 400 });
  }

  let html: string;
  try {
    // safeFetchText refuses localhost / private-network targets (SSRF guard)
    const res = await safeFetchText(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
      },
      timeoutMs: 15000,
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `לא הצלחתי לטעון את הדף (סטטוס ${res.status}). ייתכן שהאתר חוסם גישה אוטומטית — אפשר להעתיק ולהדביק את התיאור ידנית.` },
        { status: 422 }
      );
    }
    html = res.text;
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "לא הצלחתי לטעון את הדף. בדקו את הלינק, או העתיקו את תיאור המשרה ידנית." },
      { status: 422 }
    );
  }

  const text = htmlToText(html);
  if (text.trim().length < 50) {
    return NextResponse.json(
      { error: "הדף נטען אך לא נמצא בו תוכן קריא (ייתכן שהאתר דורש JavaScript). העתיקו את התיאור ידנית." },
      { status: 422 }
    );
  }

  const extracted = await extractJobFromPage(text);
  return NextResponse.json(extracted);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
