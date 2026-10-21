"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_LABELS } from "@/lib/types";

type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  status: string;
  createdAt: string;
  _count: { recommendations: number; posts: number; publications: number };
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs);
  }, []);

  if (!jobs) return <p className="text-slate-500">טוען משרות…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">משרות</h1>
        <Link
          href="/jobs/new"
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          + משרה חדשה
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
          אין משרות עדיין.{" "}
          <Link href="/jobs/new" className="text-indigo-600 hover:underline">
            צרו את המשרה הראשונה
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr className="text-right">
                <th className="p-3 font-normal">משרה</th>
                <th className="p-3 font-normal">חברה</th>
                <th className="p-3 font-normal">סטטוס</th>
                <th className="p-3 font-normal">המלצות</th>
                <th className="p-3 font-normal">פוסטים</th>
                <th className="p-3 font-normal">פרסומים</th>
                <th className="p-3 font-normal">נוצרה</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3">
                    <Link href={`/jobs/${j.id}`} className="text-indigo-600 hover:underline font-medium">
                      {j.title}
                    </Link>
                    {j.location && <span className="text-slate-400 text-xs mr-2">{j.location}</span>}
                  </td>
                  <td className="p-3 text-slate-600">{j.company || "—"}</td>
                  <td className="p-3">
                    <span className="text-xs bg-slate-100 rounded-full px-3 py-1">
                      {STATUS_LABELS[j.status] ?? j.status}
                    </span>
                  </td>
                  <td className="p-3">{j._count.recommendations}</td>
                  <td className="p-3">{j._count.posts}</td>
                  <td className="p-3">{j._count.publications}</td>
                  <td className="p-3 text-slate-400">
                    {new Date(j.createdAt).toLocaleDateString("he-IL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
