"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMPTY = {
  title: "",
  company: "",
  sourceUrl: "",
  description: "",
  requirements: "",
  advantages: "",
  location: "",
  employmentType: "",
  seniority: "",
};

export default function NewJobPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [discreet, setDiscreet] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleImport() {
    setError("");
    setNotice("");
    setImporting(true);
    try {
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "הייבוא נכשל");
        return;
      }
      setForm({
        title: data.title ?? "",
        company: data.company ?? "",
        sourceUrl: importUrl,
        description: data.description ?? "",
        requirements: data.requirements ?? "",
        advantages: data.advantages ?? "",
        location: data.location ?? "",
        employmentType: data.employmentType ?? "",
        seniority: data.seniority ?? "",
      });
      setNotice("פרטי המשרה יובאו מהלינק — בדקו ותקנו לפני שמירה.");
    } catch {
      setError("הייבוא נכשל — נסו שוב או מלאו ידנית.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Discreet jobs: company & location are dropped client-side too
        body: JSON.stringify(
          discreet ? { ...form, company: "", location: "", discreet: true } : { ...form, discreet: false }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שמירת המשרה נכשלה");
        return;
      }
      router.push(`/jobs/${data.id}`);
    } catch {
      setError("שמירת המשרה נכשלה — נסו שוב.");
      setSubmitting(false);
    }
  }

  const input = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const label = "block text-sm font-medium mb-1";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">משרה חדשה</h1>

      {/* Import from URL */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <label className={label}>יש כבר משרה מפורסמת? הדביקו לינק והמערכת תמלא את הטופס</label>
        <div className="flex gap-2">
          <input
            type="url"
            dir="ltr"
            className={input}
            placeholder="https://..."
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !importUrl}
            className="whitespace-nowrap bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {importing ? "מייבא…" : "ייבוא מלינק"}
          </button>
        </div>
      </div>

      {notice && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">{notice}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {/* Discreet job toggle */}
        <label
          className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
            discreet ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200"
          }`}
        >
          <input
            type="checkbox"
            checked={discreet}
            onChange={(e) => setDiscreet(e.target.checked)}
            className="mt-1 w-4 h-4 accent-slate-600"
          />
          <span className="text-sm">
            <span className="font-medium">🕵️ משרה דיסקרטית</span>
            <span className={`block text-xs mt-0.5 ${discreet ? "text-slate-300" : "text-slate-500"}`}>
              תותאם רק לקבוצות שמסומנות לפרופיל הדיסקרטי. שם החברה והמיקום לא יישלחו ל-AI ולא יופיעו
              בפוסטים — ״חברה מובילה בתחומה, פרטים בשיחה אישית״.
            </span>
          </span>
        </label>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={label}>שם המשרה *</label>
            <input className={input} value={form.title} onChange={set("title")} required placeholder="שם התפקיד כפי שיופיע בפוסט" />
          </div>
          {!discreet && (
            <div>
              <label className={label}>שם החברה (אופציונלי)</label>
              <input className={input} value={form.company} onChange={set("company")} placeholder="יופיע בפוסטים אם ימולא" />
            </div>
          )}
        </div>

        <div>
          <label className={label}>קישור למשרה / להגשת קו״ח (יצורף אוטומטית לכל פוסט)</label>
          <input className={input} dir="ltr" type="url" value={form.sourceUrl} onChange={set("sourceUrl")} placeholder="https://..." />
        </div>

        <div>
          <label className={label}>תיאור המשרה (JD) *</label>
          <textarea className={input} rows={6} value={form.description} onChange={set("description")} required placeholder="תיאור התפקיד, תחומי אחריות, הצוות…" />
        </div>

        <div>
          <label className={label}>דרישות חובה</label>
          <textarea className={input} rows={4} value={form.requirements} onChange={set("requirements")} placeholder="שורה לכל דרישה" />
        </div>

        <div>
          <label className={label}>יתרונות</label>
          <textarea className={input} rows={3} value={form.advantages} onChange={set("advantages")} placeholder="שורה לכל יתרון" />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {!discreet && (
          <div>
            <label className={label}>מיקום</label>
            <input className={input} value={form.location} onChange={set("location")} placeholder="עיר, היברידי או מרחוק" />
          </div>
          )}
          <div>
            <label className={label}>סוג העסקה</label>
            <select className={input} value={form.employmentType} onChange={set("employmentType")}>
              <option value="">בחרו…</option>
              <option value="משרה מלאה">משרה מלאה</option>
              <option value="משרה חלקית">משרה חלקית</option>
              <option value="פרילנס">פרילנס</option>
              <option value="היברידי">היברידי</option>
              <option value="מרחוק">מרחוק</option>
            </select>
          </div>
          <div>
            <label className={label}>רמת בכירות (Seniority)</label>
            <select className={input} value={form.seniority} onChange={set("seniority")}>
              <option value="">בחרו…</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead / ראש צוות</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 text-white font-medium py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? "🤖 מנתח את המשרה עם AI ומאתר קהילות מתאימות…" : "צור משרה ונתח עם AI"}
        </button>
      </form>
    </div>
  );
}
