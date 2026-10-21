"use client";

import { useEffect, useRef, useState } from "react";
import { CHANNEL_LABELS, parseJsonArray } from "@/lib/types";

export type PCCommunity = {
  id: string;
  name: string;
  platform: string;
  url: string;
  memberCount: number;
  membership?: string;
  canPost?: boolean;
};

export type PCRecommendation = {
  id: string;
  score: number;
  reasons: string;
  status: string; // pending | approved | published
  community: PCCommunity;
};

export type PCPost = { id: string; channel: string; content: string; imagePath?: string };

export type PCPublication = {
  id: string;
  communityId: string | null;
  channel: string;
  publishedAt: string;
  notes: string;
  candidatesTotal: number;
  candidatesRelevant: number;
  hired: number;
  community?: PCCommunity | null;
};

export type PCJob = {
  id: string;
  discreet?: boolean;
  recommendations: PCRecommendation[];
  posts: PCPost[];
  publications: PCPublication[];
};

const PLATFORM_ICONS: Record<string, string> = {
  facebook: "📘",
  whatsapp: "💬",
  linkedin: "💼",
};

// Only http(s) links are rendered as clickable; anything else becomes plain text.
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : undefined);

// The WhatsApp discovery/join flow is preserved in the codebase but hidden
// from the dashboard for now. Set to true when the feature is ready to return.
const SHOW_WHATSAPP_DISCOVERY = false;

// Browser automation (Facebook group discovery, join checks, the WhatsApp
// Chrome connection and server-side batch publishing) is not included in this
// repository: the server answers those routes with 501 or a manual fallback.
// The matching controls stay in the code for forks that add automation back.
const SHOW_AUTOMATION_CONTROLS = false;

/**
 * Three-step publish flow per job:
 * 1. Posts are drafted per channel (handled elsewhere on the page)
 * 2. Matched groups are listed with score + reasons
 * 3. Per-group approve → publish buttons, plus a global approve-all.
 *    Publish copies the channel's post and opens the group — posting happens
 *    from the recruiter's own profile; nothing is sent without their action.
 */
type BatchResult = { name: string; ok: boolean; note: string };
type BatchState = {
  running: boolean;
  done: number;
  total: number;
  current: string;
  results: BatchResult[];
};

type WhatsAppConnection = {
  loaded: boolean;
  connected: boolean;
  groupLookup: boolean;
  publishReady: boolean;
  mediaReady: boolean;
};

type WhatsAppSource = {
  id: string;
  name: string;
  url: string;
  approved: boolean;
  userProvided: boolean;
};

type WhatsAppCandidate = {
  id: string;
  name: string;
  category: string;
  region: string;
  info: string;
  inviteUrl: string;
  sourceName: string;
  sourceUrl: string;
  score: number;
  reasons: string[];
};

export default function PublishCenter({ job, onChanged }: { job: PCJob; onChanged: () => void }) {
  const pubByCommunity = new Map(
    job.publications.filter((p) => p.communityId).map((p) => [p.communityId!, p])
  );
  const postByChannel = new Map(job.posts.map((p) => [p.channel, p.content]));
  const pendingCount = job.recommendations.filter((r) => r.status === "pending").length;
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [whatsappConnection, setWhatsappConnection] = useState<WhatsAppConnection>({
    loaded: false,
    connected: false,
    groupLookup: false,
    publishReady: false,
    mediaReady: false,
  });
  const [waConnect, setWaConnect] = useState<{ running: boolean; status: string; error?: string }>({
    running: false,
    status: "",
  });

  async function loadWhatsAppConnection() {
    try {
      const data = await fetch("/api/publish-status").then((r) => r.json());
      setWhatsappConnection({ loaded: true, ...data.whatsappConnection });
      return data.whatsappConnection?.publishReady === true;
    } catch {
      setWhatsappConnection((state) => ({ ...state, loaded: true }));
      return false;
    }
  }

  useEffect(() => {
    loadWhatsAppConnection();
  }, []);

  async function pollWhatsAppSession() {
    const data = await fetch("/api/whatsapp-session").then((r) => r.json()).catch(() => null);
    if (!data) {
      setWaConnect({ running: false, status: "החיבור נכשל", error: "לא ניתן לקרוא את מצב החיבור" });
      return;
    }
    setWaConnect(data);
    if (data.running) {
      setTimeout(pollWhatsAppSession, 2500);
    } else if (data.ok) {
      await loadWhatsAppConnection();
    }
  }

  async function connectWhatsAppChrome() {
    setWaConnect({ running: true, status: "פותח Google Chrome…" });
    const response = await fetch("/api/whatsapp-session", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setWaConnect(data);
    if (data.running) setTimeout(pollWhatsAppSession, 1500);
  }

  const [waSources, setWaSources] = useState<WhatsAppSource[]>([]);
  const [sourceBusy, setSourceBusy] = useState("");
  const [waSearchBusy, setWaSearchBusy] = useState(false);
  const [waPreview, setWaPreview] = useState<{
    previewId: string;
    candidates: WhatsAppCandidate[];
    warnings: string[];
  } | null>(null);
  const [waSelected, setWaSelected] = useState<Set<string>>(new Set());
  const [waJoin, setWaJoin] = useState<{
    running: boolean;
    status: string;
    joined: { name: string; inviteUrl: string }[];
    failed: { name: string; inviteUrl: string; reason: string }[];
    error?: string;
  } | null>(null);

  async function loadWaSources() {
    const response = await fetch("/api/whatsapp-sources");
    if (response.ok) setWaSources(await response.json());
  }

  useEffect(() => {
    loadWaSources().catch(() => {});
  }, []);

  async function setSourceApproval(sourceId: string, approved: boolean) {
    setSourceBusy(sourceId);
    try {
      const response = await fetch("/api/whatsapp-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, approved }),
      });
      if (response.ok) {
        await loadWaSources();
        setWaPreview(null);
        setWaSelected(new Set());
      }
    } finally {
      setSourceBusy("");
    }
  }

  async function previewWhatsAppGroups() {
    setWaSearchBusy(true);
    setWaJoin(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/whatsapp-discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setWaJoin({ running: false, status: "החיפוש נכשל", joined: [], failed: [], error: data.error });
        return;
      }
      setWaPreview(data);
      setWaSelected(new Set(data.candidates.map((candidate: WhatsAppCandidate) => candidate.id)));
    } finally {
      setWaSearchBusy(false);
    }
  }

  async function pollWhatsAppJoin(runId: string) {
    const response = await fetch(`/api/jobs/${job.id}/whatsapp-discover?runId=${runId}`);
    if (!response.ok) return;
    const data = await response.json();
    setWaJoin(data);
    if (data.running) setTimeout(() => pollWhatsAppJoin(runId), 4000);
    else {
      setWaPreview(null);
      setWaSelected(new Set());
      onChanged();
    }
  }

  async function joinWhatsAppGroups() {
    if (!waPreview || waSelected.size === 0) return;
    setWaJoin({ running: true, status: "מתחיל הצטרפות…", joined: [], failed: [] });
    const response = await fetch(`/api/jobs/${job.id}/whatsapp-discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "join",
        previewId: waPreview.previewId,
        candidateIds: [...waSelected],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.runId) {
      setWaJoin({ running: false, status: "ההצטרפות נכשלה", joined: [], failed: [], error: data.error });
      return;
    }
    pollWhatsAppJoin(data.runId);
  }

  // Groups that can be batch-published (automation only). Mirrors the checks in
  // src/lib/publisher.ts and excludes announcement-only WhatsApp groups.
  const selectable: PCRecommendation[] = !SHOW_AUTOMATION_CONTROLS ? [] : job.recommendations.filter(
    (r) =>
      r.status !== "published" &&
      !pubByCommunity.has(r.community.id) &&
      r.community.membership === "member" &&
      ((r.community.platform === "facebook" && r.community.url.startsWith("http")) ||
        (r.community.platform === "whatsapp" &&
          whatsappConnection.publishReady &&
          r.community.url.startsWith("wa:") &&
          r.community.canPost !== false))
  );

  function toggleSelect(recId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(recId)) next.delete(recId);
      else next.add(recId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(selectable.map((r) => r.id)));
  }

  // Platform-level select-all (the checkbox next to the פייסבוק / וואטסאפ heading)
  function togglePlatform(platform: string, checked: boolean) {
    const ids = selectable.filter((r) => r.community.platform === platform).map((r) => r.id);
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  // Server-side batch: the server publishes Facebook first then WhatsApp and
  // keeps going even if this tab is refreshed or closed; we only poll progress.
  // Marking + clicking the batch button IS the recruiter's explicit approval.
  const lastDone = useRef(0);

  async function pollBatch(batchId: string) {
    let res: Response;
    try {
      res = await fetch(`/api/publish-batch?id=${batchId}`);
    } catch {
      setTimeout(() => pollBatch(batchId), 5000);
      return;
    }
    if (!res.ok) {
      localStorage.removeItem("publishBatchId");
      setBatch(null);
      return;
    }
    const p = await res.json();
    setBatch({
      running: p.running,
      done: p.done,
      total: p.total,
      current: p.current,
      results: p.results.map((r: { name: string; ok: boolean; note: string }) => ({
        name: r.name,
        ok: r.ok,
        note: r.note,
      })),
    });
    if (p.done !== lastDone.current) {
      lastDone.current = p.done;
      onChanged();
    }
    if (p.running) {
      setTimeout(() => pollBatch(batchId), 3000);
    } else {
      localStorage.removeItem("publishBatchId");
      onChanged();
    }
  }

  // Resume progress display after a page refresh mid-batch
  useEffect(() => {
    const id = localStorage.getItem("publishBatchId");
    if (id) pollBatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function batchPublish() {
    const ids = selectable.filter((r) => selected.has(r.id)).map((r) => r.community.id);
    if (ids.length === 0) return;
    setBatch({ running: true, done: 0, total: ids.length, current: "", results: [] });
    const res = await fetch("/api/publish-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, communityIds: ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.batchId) {
      setBatch(null);
      return;
    }
    localStorage.setItem("publishBatchId", data.batchId);
    setSelected(new Set());
    pollBatch(data.batchId);
  }

  async function approveAll() {
    await fetch(`/api/jobs/${job.id}/approve-all`, { method: "POST" });
    onChanged();
  }

  // --- Discovery: find & join 5 new groups for this job ---
  const [discover, setDiscover] = useState<{
    running: boolean;
    status: string;
    joined: { name: string; url: string }[];
    manual: { name: string; url: string }[];
    error?: string;
  } | null>(null);
  const [discoverAuto, setDiscoverAuto] = useState(true);
  const [checkingJoins, setCheckingJoins] = useState(false);
  const [joinsResult, setJoinsResult] = useState("");

  async function pollDiscover(runId: string) {
    const res = await fetch(`/api/jobs/${job.id}/discover?runId=${runId}`);
    if (!res.ok) return setDiscover(null);
    const p = await res.json();
    setDiscover(p);
    if (p.running) setTimeout(() => pollDiscover(runId), 4000);
    else onChanged();
  }

  async function startDiscover() {
    setDiscover({ running: true, status: "מחפש קבוצות חדשות…", joined: [], manual: [] });
    const res = await fetch(`/api/jobs/${job.id}/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoPublish: discoverAuto, count: 5 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.runId) {
      setDiscover({ running: false, status: "נכשל", joined: [], manual: [], error: data.error });
      return;
    }
    pollDiscover(data.runId);
  }

  async function checkJoins() {
    setCheckingJoins(true);
    setJoinsResult("בודק אישורי הצטרפות…");
    try {
      const res = await fetch("/api/check-joins", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setJoinsResult(data.error ?? "הבדיקה נכשלה");
        return;
      }
      const approved = data.results?.flatMap((r: { approved: unknown[] }) => r.approved) ?? [];
      const pending = data.results?.reduce((n: number, r: { stillPending: number }) => n + r.stillPending, 0) ?? 0;
      setJoinsResult(
        `${approved.length} הצטרפויות אושרו, ${pending} עדיין ממתינות` +
          (data.published?.length ? ` · פורסמו אוטומטית ב-${data.published.length} קבוצות חדשות` : "")
      );
      onChanged();
    } catch {
      setJoinsResult("הבדיקה נכשלה");
    } finally {
      setCheckingJoins(false);
    }
  }

  async function generatePosts() {
    setGenerating(true);
    try {
      await fetch(`/api/jobs/${job.id}/posts`, { method: "POST" });
      onChanged();
    } finally {
      setGenerating(false);
    }
  }

  const groups = ["facebook", "whatsapp"]
    .map((platform) => ({
      platform,
      recs: job.recommendations.filter((r) => r.community.platform === platform),
    }))
    .filter((g) => g.recs.length > 0);

  const emptyGroupsMessage = groups.length === 0 ? (job.discreet ? (
      <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
        🕵️ משרה דיסקרטית — מותאמת רק לקבוצות פייסבוק שמסומנות לפרופיל הדיסקרטי (fbProfile = discreet).
        עדיין אין קבוצות כאלה במערכת.
      </p>
    ) : (
      <p className="text-sm text-slate-400">לא נמצאו קבוצות מתאימות למשרה זו.</p>
    )) : null;

  return (
    <div className="space-y-5">
      {emptyGroupsMessage}
      {job.discreet && (
        <p className="text-xs bg-slate-800 text-white rounded-lg px-3 py-2">
          🕵️ משרה דיסקרטית — מותאמת רק לקבוצות הפרופיל הדיסקרטי; הפוסטים לא כוללים שם חברה או מיקום.
        </p>
      )}
      {/* Where the job was actually published */}
      {job.publications.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
          <div className="text-sm font-medium text-emerald-900 mb-1">
            ✓ המשרה פורסמה ב-{job.publications.length} קבוצות:
          </div>
          <ul className="text-xs text-emerald-800 space-y-0.5">
            {job.publications.map((p) => (
              <li key={p.id}>
                {PLATFORM_ICONS[p.channel]} {p.community?.name ?? p.channel} —{" "}
                {new Date(p.publishedAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                {p.notes === "פורסם אוטומטית" ? " · נשלח אוטומטית" : " · פורסם ידנית"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 1 — editable post drafts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm">📝 שלב 1 — ניסוח הפוסטים (לחצו על הטקסט לעריכה)</h3>
          <button
            onClick={generatePosts}
            disabled={generating}
            className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
          >
            {generating ? "⏳ מייצר…" : job.posts.length ? "✨ צור מחדש" : "✨ צור פוסטים"}
          </button>
        </div>
        {job.posts.length === 0 ? (
          <p className="text-sm text-slate-400">אין עדיין פוסטים — לחצו על ״צור פוסטים״ והם יופיעו כאן לעריכה ואישור.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {["linkedin", "facebook", "whatsapp"].map((ch) => {
              const post = job.posts.find((p) => p.channel === ch);
              return post ? <EditablePost key={post.id} post={post} onChanged={onChanged} /> : null;
            })}
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
          <span className="text-sm text-indigo-900">
            {pendingCount} קבוצות ממתינות לאישור שלך — שום דבר לא מתפרסם בלעדיו
          </span>
          <button
            onClick={approveAll}
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 whitespace-nowrap"
          >
            ✔ אישור כללי לכל הקבוצות
          </button>
        </div>
      )}

      {/* Discovery — find & join new groups for this job (automation only) */}
      {SHOW_AUTOMATION_CONTROLS && (
      <div className="bg-sky-50 border border-sky-100 rounded-lg px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-sky-900">🔍 הרחבת תפוצה — חיפוש קבוצות חדשות והצטרפות אליהן</span>
          <label className="flex items-center gap-1.5 text-xs text-sky-800 cursor-pointer">
            <input
              type="checkbox"
              checked={discoverAuto}
              onChange={(e) => setDiscoverAuto(e.target.checked)}
              className="w-3.5 h-3.5 accent-sky-600"
            />
            פרסם אוטומטית ברגע שההצטרפות תאושר
          </label>
          <button
            onClick={startDiscover}
            disabled={discover?.running}
            className="bg-sky-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {discover?.running ? "⏳ מחפש ומצטרף…" : "מצא 5 קבוצות חדשות והצטרף"}
          </button>
          <button
            onClick={checkJoins}
            disabled={checkingJoins}
            className="text-xs text-sky-700 border border-sky-300 px-3 py-1.5 rounded-lg hover:bg-sky-100 disabled:opacity-50"
          >
            {checkingJoins ? "⏳ בודק…" : "בדוק אישורי הצטרפות"}
          </button>
        </div>
        {discover && (
          <div className="text-xs space-y-1">
            <p className="text-sky-800">{discover.status}</p>
            {discover.error && <p className="text-red-600">{discover.error}</p>}
            {discover.joined.map((g, i) => (
              <p key={i} className="text-emerald-700">✓ בקשת הצטרפות: {g.name}</p>
            ))}
            {discover.manual.map((g, i) => (
              <p key={i} className="text-amber-700">
                ✋ דורש הצטרפות ידנית (שאלות מנהלים): <a href={safeHref(g.url)} target="_blank" rel="noreferrer" className="underline">{g.name}</a>
              </p>
            ))}
            {!discover.running && discover.joined.length > 0 && (
              <p className="text-sky-800">
                ההצטרפות ממתינה לאישור מנהלי הקבוצות (שעות עד ימים). לחצו ״בדוק אישורי הצטרפות״ מדי פעם —
                {discoverAuto ? " המשרה תפורסם אוטומטית בכל קבוצה שתאושר." : " קבוצות שאושרו יופיעו לפרסום."}
              </p>
            )}
          </div>
        )}
        {joinsResult && <p className="text-xs text-sky-800">{joinsResult}</p>}
      </div>
      )}

      {/* WhatsApp discovery is deliberately two-step: preview, then explicit join approval. */}
      {SHOW_WHATSAPP_DISCOVERY && (
      <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-emerald-950">💬 הרחבת תפוצה ב-WhatsApp</div>
            <div className="text-xs text-emerald-800 mt-0.5">
              המערכת תציג 5 קבוצות לפי מילות המשרה. ההצטרפות מתבצעת רק לאחר אישור נוסף שלך.
            </div>
          </div>
          <button
            onClick={previewWhatsAppGroups}
            disabled={waSearchBusy || waJoin?.running}
            className="bg-emerald-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {waSearchBusy ? "⏳ מחפש…" : "מצא 5 קבוצות WhatsApp"}
          </button>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-white/70 p-3 space-y-2">
          <div className="text-xs font-medium text-emerald-950">מקורות לקבוצות</div>
          {waSources.map((source) => (
            <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <a href={safeHref(source.url)} target="_blank" rel="noreferrer" className="text-emerald-800 hover:underline">
                {source.name} ↗
              </a>
              {source.userProvided ? (
                <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">המקור שסיפקת · מאושר</span>
              ) : (
                <button
                  onClick={() => setSourceApproval(source.id, !source.approved)}
                  disabled={sourceBusy === source.id || waJoin?.running}
                  className={`rounded-md border px-2.5 py-1 disabled:opacity-50 ${
                    source.approved
                      ? "border-amber-300 text-amber-800 hover:bg-amber-50"
                      : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  }`}
                >
                  {sourceBusy === source.id ? "שומר…" : source.approved ? "בטלי אישור מקור" : "אשרי שימוש במקור"}
                </button>
              )}
            </div>
          ))}
          <p className="text-[11px] text-emerald-700">
            מקורות נוספים אינם נסרקים ואינם משמשים להצטרפות לפני אישור שלך כאן.
          </p>
        </div>

        {waPreview && (
          <div className="space-y-2">
            {waPreview.candidates.length === 0 ? (
              <p className="text-xs text-amber-700">לא נמצאו כרגע קבוצות חדשות מתאימות במקורות המאושרים.</p>
            ) : (
              <>
                <div className="text-xs font-medium text-emerald-950">5 ההתאמות המוצעות — אפשר להסיר סימון לפני ההצטרפות:</div>
                {waPreview.candidates.map((candidate) => (
                  <label key={candidate.id} className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-white p-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={waSelected.has(candidate.id)}
                      onChange={(event) => setWaSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(candidate.id); else next.delete(candidate.id);
                        return next;
                      })}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <a href={safeHref(candidate.inviteUrl)} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-900 hover:underline">
                          {candidate.name} ↗
                        </a>
                        <span className="text-[11px] rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">התאמה {candidate.score}</span>
                      </span>
                      <span className="block text-[11px] text-slate-600 mt-0.5">
                        {[candidate.category, candidate.region, candidate.reasons.join(" · ")].filter(Boolean).join(" · ")}
                      </span>
                      <a href={safeHref(candidate.sourceUrl)} target="_blank" rel="noreferrer" className="text-[11px] text-slate-500 hover:underline">
                        מקור: {candidate.sourceName}
                      </a>
                    </span>
                  </label>
                ))}
                <button
                  onClick={joinWhatsAppGroups}
                  disabled={waSelected.size === 0 || waJoin?.running}
                  className="bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                >
                  {waJoin?.running ? "⏳ מצטרף…" : `אשרי והצטרפי ל-${waSelected.size} קבוצות`}
                </button>
                <p className="text-[11px] text-emerald-700">הלחיצה מאשרת הצטרפות בלבד; שום פוסט לא יישלח בשלב הזה.</p>
              </>
            )}
            {waPreview.warnings.map((warning) => <p key={warning} className="text-[11px] text-amber-700">⚠ {warning}</p>)}
          </div>
        )}

        {waJoin && (
          <div className="text-xs space-y-1">
            <p className={waJoin.error ? "text-red-700" : "text-emerald-800"}>{waJoin.status}</p>
            {waJoin.error && <p className="text-red-700">{waJoin.error}</p>}
            {waJoin.joined.map((group) => <p key={group.inviteUrl} className="text-emerald-700">✓ הצטרפת: {group.name}</p>)}
            {waJoin.failed.map((group) => <p key={group.inviteUrl} className="text-amber-700">לא הצטרף: {group.name} — {group.reason}</p>)}
            {!waJoin.running && waJoin.joined.length > 0 && (
              <p className="text-emerald-800">הקבוצות נוספו לרשימת הפרסום וממתינות לאישור הפוסט שלך.</p>
            )}
          </div>
        )}
      </div>
      )}

      {/* Batch publish — mark groups, publish all: Facebook first, then WhatsApp */}
      {selectable.length > 0 && (
        <div className="bg-violet-50 border border-violet-100 rounded-lg px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-violet-900">
              ⚡ פרסום מרוכז — סמנו קבוצות ופרסמו הכל בלחיצה אחת ({selected.size} מסומנות)
            </span>
            <button onClick={selectAll} className="text-xs text-violet-700 border border-violet-300 px-3 py-1 rounded-lg hover:bg-violet-100">
              סמן את כל הקבוצות ({selectable.length})
            </button>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:underline">
                נקה בחירה
              </button>
            )}
            <button
              onClick={batchPublish}
              disabled={selected.size === 0 || batch?.running || job.posts.length === 0}
              title={job.posts.length === 0 ? "צרו פוסטים קודם" : ""}
              className="bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 mr-auto"
            >
              {batch?.running ? "⏳ מפרסם…" : `🚀 פרסם את הקבוצות המסומנות`}
            </button>
          </div>
          {batch && (
            <div className="text-xs space-y-1">
              {batch.running && (
                <p className="text-violet-800">
                  מפרסם {Math.min(batch.done + 1, batch.total)}/{batch.total}: {batch.current}… — אפשר לסגור או לרענן את הדף, הפרסום ממשיך ברקע
                </p>
              )}
              {!batch.running && batch.results.length > 0 && (
                <p className="font-medium text-violet-900">
                  הסתיים — {batch.results.filter((r) => r.ok).length} פורסמו, {batch.results.filter((r) => !r.ok).length} נכשלו
                </p>
              )}
              <ul className="space-y-0.5">
                {batch.results.map((r, i) => (
                  <li key={i} className={r.ok ? "text-emerald-700" : "text-amber-700"}>
                    {r.ok ? "✓" : "✗"} {r.name} — {r.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {groups.map((g) => {
        const platformSelectable = selectable.filter((r) => r.community.platform === g.platform);
        const allChecked =
          platformSelectable.length > 0 && platformSelectable.every((r) => selected.has(r.id));
        return (
        <div key={g.platform}>
          <h3 className="font-medium mb-2 text-sm flex items-center gap-2">
            {platformSelectable.length > 0 && (
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => togglePlatform(g.platform, e.target.checked)}
                className="w-4 h-4 accent-violet-600 cursor-pointer"
                title={`סמנו את כל קבוצות ה${CHANNEL_LABELS[g.platform]} לפרסום מרוכז`}
              />
            )}
            <span>
              {PLATFORM_ICONS[g.platform]} {CHANNEL_LABELS[g.platform]}
              {platformSelectable.length > 0 && (
                <span className="text-xs text-slate-400 mr-2">
                  — סימון הכל ({platformSelectable.length})
                </span>
              )}
              {!postByChannel.has(g.platform === "linkedin" ? "linkedin" : g.platform) && (
                <span className="text-xs text-amber-600 mr-2">— צרו פוסטים לפני פרסום</span>
              )}
            </span>
          </h3>
          {SHOW_AUTOMATION_CONTROLS && g.platform === "whatsapp" && !whatsappConnection.publishReady && (
            <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-2 flex flex-wrap items-center gap-2">
              <span>
                חיבור חד־פעמי נדרש. לאחריו Google Chrome ייכנס לארכיון, יפרסם ויוודא שליחה באופן אוטונומי.
              </span>
              <button
                onClick={connectWhatsAppChrome}
                disabled={waConnect.running}
                className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
              >
                {waConnect.running ? "⏳ ממתין לחיבור…" : "חבר WhatsApp ב-Chrome"}
              </button>
              {waConnect.status && <span>{waConnect.status}</span>}
              {waConnect.error && <span className="text-red-700">{waConnect.error}</span>}
            </div>
          )}
          <div className="space-y-2">
            {g.recs.map((rec) => (
              <GroupRow
                key={rec.id}
                rec={rec}
                jobId={job.id}
                postContent={postByChannel.get(rec.community.platform) ?? ""}
                publication={pubByCommunity.get(rec.community.id)}
                onChanged={onChanged}
                automationReady={
                  !SHOW_AUTOMATION_CONTROLS || rec.community.platform !== "whatsapp" || whatsappConnection.publishReady
                }
                selectable={selectable.some((s) => s.id === rec.id)}
                checked={selected.has(rec.id)}
                onToggle={() => toggleSelect(rec.id)}
              />
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function EditablePost({ post, onChanged }: { post: PCPost; onChanged: () => void }) {
  const [text, setText] = useState(post.content);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const dirty = text !== post.content;

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">
          {PLATFORM_ICONS[post.channel]} {CHANNEL_LABELS[post.channel]}
          {dirty && <span className="text-amber-600 text-xs mr-2">• לא נשמר</span>}
        </span>
        <div className="flex gap-2">
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "שומר…" : "💾 שמור"}
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-xs text-indigo-600 hover:underline"
          >
            {copied ? "✓ הועתק" : "העתק"}
          </button>
        </div>
      </div>
      {post.imagePath && (
        <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <img
            src={post.imagePath.startsWith("public/") ? post.imagePath.slice("public".length) : post.imagePath}
            alt="תמונת הגיוס המצורפת לפוסט"
            className="aspect-square w-full object-cover"
          />
          <p className="px-2 py-1.5 text-[11px] text-emerald-700">התמונה מצורפת לפוסט — העלו אותה ידנית בעת הפרסום</p>
        </div>
      )}
      <textarea
        dir="rtl"
        className="w-full border border-slate-100 rounded-lg p-2 text-sm text-slate-700 flex-1 min-h-[420px] focus:outline-none focus:ring-2 focus:ring-indigo-300"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-[11px] text-slate-400 mt-1">הפרסום ישתמש בגרסה השמורה — אחרי עריכה לחצו ״שמור״</p>
    </div>
  );
}

function GroupRow({
  rec,
  jobId,
  postContent,
  publication,
  onChanged,
  automationReady,
  selectable,
  checked,
  onToggle,
}: {
  rec: PCRecommendation;
  jobId: string;
  postContent: string;
  publication?: PCPublication;
  onChanged: () => void;
  automationReady: boolean;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const reasons = parseJsonArray(rec.reasons);
  const [showReasons, setShowReasons] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAsk, setConfirmAsk] = useState(false);
  const [results, setResults] = useState({
    candidatesTotal: publication?.candidatesTotal ?? 0,
    candidatesRelevant: publication?.candidatesRelevant ?? 0,
    hired: publication?.hired ?? 0,
  });

  async function approve() {
    await fetch(`/api/recommendations/${rec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    onChanged();
  }

  async function publish(force = false) {
    setBusy(true);
    setFlash("מכין את הפרסום…");
    try {
      // 1. Ask the server to publish. It validates the request (approval, post,
      //    duplicates, discreet rule); without automation it returns the manual fallback.
      const res = await fetch("/api/publish-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, communityId: rec.community.id, force }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setFlash("✓ פורסם אוטומטית מהחשבון שלך");
        onChanged();
        return;
      }

      // Definitive server answer (e.g. already published) — sync the UI, no fallback
      if (!data.fallback) {
        setFlash(data.error ?? "הפרסום נכשל");
        onChanged();
        return;
      }

      // 2. Fallback — assisted publish: copy the post and open the group.
      // NOT recorded as published until the recruiter confirms they actually posted.
      // clipboard.writeText throws if the tab lost focus — non-fatal, keep going.
      if (postContent) {
        try {
          await navigator.clipboard.writeText(postContent);
        } catch {}
      }
      if (rec.community.url.startsWith("http")) {
        window.open(rec.community.url, "_blank", "noopener,noreferrer");
      } else if (rec.community.platform === "whatsapp") {
        window.open("https://web.whatsapp.com", "_blank", "noopener,noreferrer");
      }
      setFlash(
        rec.community.platform === "whatsapp"
          ? `הפוסט הועתק ללוח. בוואטסאפ שנפתח חפשו את הקבוצה ״${rec.community.name}״, הדביקו ופרסמו, ואז אשרו כאן:`
          : "הפוסט הועתק ללוח והקבוצה נפתחה. הדביקו ופרסמו שם, ואז אשרו כאן:"
      );
      setConfirmAsk(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmManualPublish() {
    await fetch("/api/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, communityId: rec.community.id, channel: rec.community.platform }),
    });
    setConfirmAsk(false);
    setFlash("");
    onChanged();
  }

  async function saveResults() {
    if (!publication) return;
    await fetch(`/api/publications/${publication.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results),
    });
    setShowResults(false);
    onChanged();
  }

  const scoreColor =
    rec.score >= 70 ? "bg-emerald-500" : rec.score >= 45 ? "bg-amber-500" : "bg-slate-400";

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex flex-wrap items-center gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={checked ?? false}
            onChange={onToggle}
            className="w-4 h-4 accent-violet-600 cursor-pointer"
            title="סמנו לפרסום מרוכז"
          />
        )}
        <div className="flex-1 min-w-44">
          <div className="text-sm font-medium">
            {rec.community.url.startsWith("http") ? (
              <a href={rec.community.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                {rec.community.name} ↗
              </a>
            ) : (
              rec.community.name
            )}
            {rec.community.memberCount > 0 && (
              <span className="text-xs text-slate-400 mr-2">
                {rec.community.memberCount.toLocaleString()} חברים
              </span>
            )}
          </div>
          <button onClick={() => setShowReasons((s) => !s)} className="text-xs text-slate-400 hover:text-slate-600">
            {showReasons ? "הסתר סיבות" : `למה מומלץ? (${reasons.length})`}
          </button>
          {showReasons && (
            <ul className="text-xs text-slate-500 mt-1 space-y-0.5">
              {reasons.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 w-32">
          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className={`h-2 ${scoreColor}`} style={{ width: `${rec.score}%` }} />
          </div>
          <span className="text-sm font-bold w-10">{rec.score}%</span>
        </div>

        {rec.status === "pending" && (
          <button
            onClick={approve}
            className="text-sm border border-indigo-600 text-indigo-600 px-4 py-1.5 rounded-lg hover:bg-indigo-50"
          >
            אשר
          </button>
        )}
        {rec.status === "approved" && (
          <button
            onClick={() => publish()}
            disabled={!automationReady || busy || (!postContent && rec.community.platform !== "linkedin")}
            title={!automationReady ? "הפרסום ייפתח לאחר שטסט שליחת WhatsApp יעבור" : !postContent ? "צרו פוסטים קודם" : ""}
            className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "⏳ מכין…" : "🚀 פרסם"}
          </button>
        )}
        {rec.status === "published" && (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-3 py-1">✓ פורסם</span>
            <button
              onClick={() => {
                if (window.confirm(`לפרסם שוב את המשרה בקבוצה ״${rec.community.name}״? הפוסט יופיע פעם נוספת.`)) {
                  publish(true);
                }
              }}
              disabled={!automationReady || busy}
              title={!automationReady ? "הפרסום ייפתח לאחר שטסט שליחת WhatsApp יעבור" : ""}
              className="text-xs text-slate-500 border border-slate-300 px-3 py-1 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? "⏳" : "🔁 פרסם שוב"}
            </button>
            <button onClick={() => setShowResults((s) => !s)} className="text-xs text-indigo-600 hover:underline">
              {showResults ? "סגור" : "עדכון תוצאות"}
            </button>
          </div>
        )}
      </div>

      {flash && <p className="text-xs text-emerald-700 mt-2">📋 {flash}</p>}
      {confirmAsk && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={confirmManualPublish}
            className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700"
          >
            ✓ פרסמתי בקבוצה
          </button>
          <button
            onClick={() => {
              setConfirmAsk(false);
              setFlash("");
            }}
            className="text-xs text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            לא פרסמתי
          </button>
        </div>
      )}

      {publication && showResults && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            מועמדים שהגיעו
            <input
              type="number"
              min={0}
              className="border border-slate-300 rounded-lg px-2 py-1 w-24"
              value={results.candidatesTotal}
              onChange={(e) => setResults((r) => ({ ...r, candidatesTotal: Number(e.target.value) }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            רלוונטיים
            <input
              type="number"
              min={0}
              className="border border-slate-300 rounded-lg px-2 py-1 w-24"
              value={results.candidatesRelevant}
              onChange={(e) => setResults((r) => ({ ...r, candidatesRelevant: Number(e.target.value) }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            גויסו
            <input
              type="number"
              min={0}
              className="border border-slate-300 rounded-lg px-2 py-1 w-24"
              value={results.hired}
              onChange={(e) => setResults((r) => ({ ...r, hired: Number(e.target.value) }))}
            />
          </label>
          <button onClick={saveResults} className="bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-indigo-700">
            שמור תוצאות
          </button>
        </div>
      )}
    </div>
  );
}
