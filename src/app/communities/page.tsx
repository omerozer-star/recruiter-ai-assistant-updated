"use client";

import { useCallback, useEffect, useState } from "react";
import { CHANNEL_LABELS, parseJsonArray } from "@/lib/types";

type Community = {
  id: string;
  name: string;
  platform: string;
  url: string;
  domain: string;
  tags: string;
  seniority: string;
  activityLevel: number;
  memberCount: number;
  contactName: string;
  notes: string;
  successScore: number;
  _count: { publications: number };
};

const EMPTY = {
  name: "",
  platform: "facebook",
  url: "",
  domain: "",
  tags: "",
  seniority: "all",
  activityLevel: "3",
  memberCount: "",
  contactName: "",
  notes: "",
};

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/communities");
    setCommunities(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "השמירה נכשלה");
      return;
    }
    setForm(EMPTY);
    setShowForm(false);
    load();
  }

  const input = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm";
  const label = "block text-xs text-slate-500 mb-1";

  if (!communities) return <p className="text-slate-500">טוען קהילות…</p>;

  const groups = ["facebook", "whatsapp", "linkedin"].map((platform) => ({
    platform,
    items: communities.filter((c) => c.platform === platform),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">מאגר קהילות</h1>
          <p className="text-sm text-slate-500 mt-1">
            הקבוצות שהמערכת ממליצה עליהן. הוסיפו את הקבוצות האמיתיות שלכם — ההמלצות ישתפרו בהתאם.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          {showForm ? "ביטול" : "+ הוספת קהילה"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 p-5 grid md:grid-cols-3 gap-4">
          <div>
            <label className={label}>שם הקבוצה *</label>
            <input className={input} value={form.name} onChange={set("name")} required />
          </div>
          <div>
            <label className={label}>פלטפורמה *</label>
            <select className={input} value={form.platform} onChange={set("platform")}>
              <option value="facebook">פייסבוק</option>
              <option value="whatsapp">וואטסאפ</option>
              <option value="linkedin">לינקדאין</option>
            </select>
          </div>
          <div>
            <label className={label}>תחום * (Data / Frontend / DevOps…)</label>
            <input className={input} value={form.domain} onChange={set("domain")} required />
          </div>
          <div>
            <label className={label}>לינק</label>
            <input className={input} dir="ltr" value={form.url} onChange={set("url")} placeholder="https://..." />
          </div>
          <div>
            <label className={label}>תגיות (מופרדות בפסיק)</label>
            <input className={input} value={form.tags} onChange={set("tags")} placeholder="תגיות מופרדות בפסיקים" />
          </div>
          <div>
            <label className={label}>Seniority</label>
            <select className={input} value={form.seniority} onChange={set("seniority")}>
              <option value="all">הכל</option>
              <option value="junior">Junior</option>
              <option value="mid">Mid</option>
              <option value="senior">Senior</option>
            </select>
          </div>
          <div>
            <label className={label}>רמת פעילות (1-5)</label>
            <select className={input} value={form.activityLevel} onChange={set("activityLevel")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>מספר חברים</label>
            <input className={input} type="number" min={0} value={form.memberCount} onChange={set("memberCount")} />
          </div>
          <div>
            <label className={label}>איש קשר / אדמין</label>
            <input className={input} value={form.contactName} onChange={set("contactName")} />
          </div>
          <div className="md:col-span-3">
            <label className={label}>הערות</label>
            <input className={input} value={form.notes} onChange={set("notes")} />
          </div>
          {error && <p className="text-sm text-red-600 md:col-span-3">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-60 md:col-span-3"
          >
            {saving ? "שומר…" : "שמור קהילה"}
          </button>
        </form>
      )}

      {groups.map((g) => (
        <div key={g.platform} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 font-medium text-sm">
            {CHANNEL_LABELS[g.platform]} ({g.items.length})
          </div>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr className="text-right border-b border-slate-100">
                <th className="p-3 font-normal">שם</th>
                <th className="p-3 font-normal">תחום</th>
                <th className="p-3 font-normal">תגיות</th>
                <th className="p-3 font-normal">פעילות</th>
                <th className="p-3 font-normal">חברים</th>
                <th className="p-3 font-normal">פרסומים</th>
                <th className="p-3 font-normal">אפקטיביות</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="p-3">
                    {c.url.startsWith("http") ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                        {c.name} ↗
                      </a>
                    ) : (
                      c.name
                    )}
                    {c.notes && <div className="text-xs text-slate-400">{c.notes}</div>}
                  </td>
                  <td className="p-3">{c.domain}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 max-w-60">
                      {parseJsonArray(c.tags).slice(0, 5).map((t) => (
                        <span key={t} className="bg-slate-100 rounded-full px-2 py-0.5 text-xs">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">{"●".repeat(c.activityLevel)}{"○".repeat(5 - c.activityLevel)}</td>
                  <td className="p-3">{c.memberCount ? c.memberCount.toLocaleString() : "—"}</td>
                  <td className="p-3">{c._count.publications}</td>
                  <td className="p-3">
                    {c.successScore > 0 ? `${(c.successScore * 100).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
