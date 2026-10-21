"use client";

import { use, useCallback, useEffect, useState } from "react";
import { STATUS_LABELS, safeJsonParse, type JobAnalysis } from "@/lib/types";
import PublishCenter, { type PCJob, type PCPost, type PCPublication, type PCRecommendation } from "@/components/PublishCenter";

type Job = PCJob & {
  title: string;
  company: string;
  description: string;
  location: string;
  employmentType: string;
  seniority: string;
  status: string;
  analysis: string | null;
  recommendations: PCRecommendation[];
  posts: PCPost[];
  publications: PCPublication[];
};

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<Job | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`);
    if (res.ok) setJob(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!job) return <p className="text-slate-500">טוען משרה…</p>;

  const analysis = safeJsonParse<JobAnalysis | null>(job.analysis, null);

  async function setStatus(status: string) {
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {[job.company, job.location, job.employmentType, job.seniority].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">סטטוס קמפיין:</span>
            <select
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
              value={job.status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {analysis && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">🤖 ניתוח AI — פרופיל חיפוש</h2>
            <span
              className={`text-xs px-3 py-1 rounded-full ${
                analysis.source === "claude" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {analysis.source === "claude" ? "נותח על ידי Claude" : "מצב דמו"}
            </span>
          </div>
          <p className="text-sm text-slate-600 mb-4">{analysis.summary}</p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500 mb-1">תחום</div>
              <span className="bg-indigo-50 text-indigo-700 rounded-full px-3 py-1">{analysis.domain}</span>
              <span className="bg-slate-100 rounded-full px-3 py-1 mr-2">Seniority: {analysis.seniority}</span>
            </div>
            <div>
              <div className="text-slate-500 mb-1">קהלי יעד</div>
              <div className="flex flex-wrap gap-1">
                {analysis.targetAudiences.map((a) => (
                  <span key={a} className="bg-slate-100 rounded-full px-3 py-1">{a}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-1">טכנולוגיות</div>
              <div className="flex flex-wrap gap-1">
                {analysis.technologies.map((t) => (
                  <span key={t} className="bg-emerald-50 text-emerald-700 rounded-full px-3 py-1">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-1">מילות חיפוש</div>
              <div className="flex flex-wrap gap-1">
                {analysis.keywords.map((k) => (
                  <span key={k} className="bg-sky-50 text-sky-700 rounded-full px-3 py-1">{k}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish center: editable posts, matched groups, approval and publishing */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-lg mb-1">🚀 מרכז פרסום</h2>
        <p className="text-sm text-slate-500 mb-5">
          עריכת הפוסטים, אישור קבוצות ופרסום — בלחיצה על ״פרסם״ הפוסט מועתק והקבוצה נפתחת; הפרסום נרשם רק אחרי שתאשרו שפרסמתם.
        </p>
        <PublishCenter job={job} onChanged={load} />
      </div>
    </div>
  );
}
