"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CHANNEL_LABELS, STATUS_LABELS } from "@/lib/types";
import PublishCenter, { type PCJob } from "@/components/PublishCenter";

type Dashboard = {
  activeJobs: number;
  totalJobs: number;
  totalPublications: number;
  candidates: number;
  relevant: number;
  hired: number;
  conversionRate: number;
  channels: Record<string, { publications: number; candidates: number; relevant: number }>;
  topCommunities: { name: string; platform: string; candidates: number; relevant: number }[];
  recentJobs: { id: string; title: string; status: string; createdAt: string }[];
  aiMode: "claude" | "demo";
};

type JobListRow = {
  id: string;
  title: string;
  status: string;
  _count: { recommendations: number; posts: number; publications: number };
};

/** Dashboard publish center — the 3-step flow (posts → matched groups → approve/publish) per job. */
function PublishPanel() {
  const [jobs, setJobs] = useState<JobListRow[]>([]);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(PCJob & { title: string }) | null>(null);

  const loadJobs = useCallback(async () => {
    const rows: JobListRow[] = await fetch("/api/jobs").then((r) => r.json());
    const withRecs = rows.filter((j) => j._count.recommendations > 0);
    setJobs(withRecs);
    if (withRecs.length > 0 && !openJobId) setOpenJobId(withRecs[0].id);
  }, [openJobId]);

  const loadDetail = useCallback(async () => {
    if (!openJobId) return setDetail(null);
    setDetail(await fetch(`/api/jobs/${openJobId}`).then((r) => r.json()));
  }, [openJobId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);
  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  if (jobs.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold mb-1">🚀 מרכז פרסום</h2>
      <p className="text-sm text-slate-500 mb-4">
        אישור ופרסום לכל קבוצה — שום דבר לא יוצא בלי האישור שלך. בלחיצה על ״פרסם״ הפוסט מועתק והקבוצה נפתחת.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {jobs.map((j) => (
          <button
            key={j.id}
            onClick={() => setOpenJobId(j.id)}
            className={`text-sm px-4 py-1.5 rounded-full border ${
              openJobId === j.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-slate-300 text-slate-600 hover:border-indigo-400"
            }`}
          >
            {j.title}
          </button>
        ))}
      </div>
      {detail && detail.id === openJobId ? (
        <PublishCenter job={detail} onChanged={loadDetail} />
      ) : (
        <p className="text-sm text-slate-400">טוען…</p>
      )}
    </div>
  );
}

type PlatformStatus = {
  published: number;
  waiting: number;
  recent: { job: string; jobId: string; community: string; publishedAt: string; notes: string }[];
};

type PublishStatus = {
  facebook: PlatformStatus;
  whatsapp: PlatformStatus;
  whatsappConnection?: {
    connected: boolean;
    groupLookup: boolean;
    publishReady: boolean;
    mediaReady: boolean;
  };
};

/** Publish status split into two panels — WhatsApp and Facebook. */
function PlatformPanels() {
  const [status, setStatus] = useState<PublishStatus | null>(null);

  const load = useCallback(async () => {
    setStatus(await fetch("/api/publish-status").then((r) => r.json()));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (!status) return null;

  const panels = [
    {
      key: "facebook" as const,
      icon: "📘",
      title: "פייסבוק",
      color: "blue",
      hint: "פרסומים שאושרו ידנית במערכת — בקבוצות עם אישור מנהלים הפוסט יופיע רק אחרי שמנהל יאשר",
      warning: undefined as string | undefined,
    },
    {
      key: "whatsapp" as const,
      icon: "💬",
      title: "וואטסאפ",
      color: "emerald",
      hint: "פרסומים שאושרו ידנית במערכת — רק בקבוצות שבהן מותר לחברים לפרסם",
      // Automation status is not shown: publishing is manual in this version
      warning: undefined as string | undefined,
    },
  ];

  return (
    <div className="grid gap-6">
      {panels.map((p) => {
        const s = status[p.key] ?? { published: 0, waiting: 0, recent: [] };
        return (
          <div key={p.key} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">
                {p.icon} פרסומים ב{p.title}
              </h2>
              <div className="flex gap-2 text-xs">
                <span className="bg-emerald-100 text-emerald-700 rounded-full px-3 py-1">
                  {s.published} פורסמו
                </span>
                <span className="bg-slate-100 text-slate-600 rounded-full px-3 py-1">
                  {s.waiting} ממתינות
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-3">{p.hint}</p>
            {p.warning && (
              <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-3">
                {p.warning}
              </p>
            )}
            {s.recent.length === 0 ? (
              <p className="text-sm text-slate-400">אין עדיין פרסומים בערוץ הזה</p>
            ) : (
              <ul className="divide-y divide-slate-50 text-sm max-h-64 overflow-y-auto">
                {s.recent.map((r, i) => (
                  <li key={i} className="py-2 flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate">{r.community}</div>
                      <div className="text-xs text-slate-400 truncate">{r.job}</div>
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap text-left">
                      {new Date(r.publishedAt).toLocaleString("he-IL", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`text-3xl font-bold ${accent ? "text-indigo-600" : ""}`}>{value}</div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-slate-500">טוען נתונים…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">דשבורד גיוס</h1>
        <span
          className={`text-xs px-3 py-1 rounded-full ${
            data.aiMode === "claude"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {data.aiMode === "claude" ? "✓ מחובר ל-Claude AI" : "מצב דמו — ללא מפתח API"}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="משרות פעילות" value={data.activeJobs} accent />
        <StatCard label="סה״כ משרות" value={data.totalJobs} />
        <StatCard label="פרסומים" value={data.totalPublications} />
        <StatCard label="מועמדים" value={data.candidates} />
        <StatCard label="רלוונטיים" value={data.relevant} />
        <StatCard
          label="אחוז המרה"
          value={`${(data.conversionRate * 100).toFixed(0)}%`}
          accent
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold mb-4">ביצועים לפי ערוץ</h2>
          {Object.keys(data.channels).length === 0 ? (
            <p className="text-sm text-slate-400">עדיין אין פרסומים — צרו משרה ופרסמו אותה</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-right border-b border-slate-100">
                  <th className="py-2 font-normal">ערוץ</th>
                  <th className="py-2 font-normal">פרסומים</th>
                  <th className="py-2 font-normal">מועמדים</th>
                  <th className="py-2 font-normal">רלוונטיים</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.channels).map(([channel, c]) => (
                  <tr key={channel} className="border-b border-slate-50">
                    <td className="py-2">{CHANNEL_LABELS[channel] ?? channel}</td>
                    <td className="py-2">{c.publications}</td>
                    <td className="py-2">{c.candidates}</td>
                    <td className="py-2">{c.relevant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold mb-4">קהילות מובילות</h2>
          {data.topCommunities.length === 0 ? (
            <p className="text-sm text-slate-400">
              עדיין אין נתוני תוצאות — עדכנו תוצאות בפרסומים כדי שהמערכת תלמד
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.topCommunities.map((c, i) => (
                <li key={i} className="flex justify-between border-b border-slate-50 py-2">
                  <span>
                    {c.name}{" "}
                    <span className="text-slate-400">({CHANNEL_LABELS[c.platform]})</span>
                  </span>
                  <span className="text-slate-500">
                    {c.relevant} רלוונטיים / {c.candidates} מועמדים
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <PlatformPanels />

      <PublishPanel />

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">משרות אחרונות</h2>
          <Link href="/jobs" className="text-sm text-indigo-600 hover:underline">
            לכל המשרות ←
          </Link>
        </div>
        {data.recentJobs.length === 0 ? (
          <p className="text-sm text-slate-400">
            אין משרות עדיין.{" "}
            <Link href="/jobs/new" className="text-indigo-600 hover:underline">
              צרו את המשרה הראשונה
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {data.recentJobs.map((j) => (
              <li key={j.id} className="py-2 flex justify-between items-center">
                <Link href={`/jobs/${j.id}`} className="text-indigo-600 hover:underline">
                  {j.title}
                </Link>
                <span className="text-xs bg-slate-100 rounded-full px-3 py-1">
                  {STATUS_LABELS[j.status] ?? j.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
