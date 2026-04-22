"use client";

import { useEffect, useMemo, useState } from "react";

type MediaType = "photo" | "video" | "music";
type MediaStatus = "RAW" | "LR" | "READY" | "USED";
type LibraryFilter = "all" | MediaType;
type HomeView = "hq" | "library";
type SmartView = "all" | "work" | "personal" | "travel" | "social" | "edited" | "inbox";

type MediaItem = {
  id: string;
  title: string;
  type: MediaType;
  status: MediaStatus;
  job: string;
  date: string;
  tags: string[];
  size: string;
  duration?: string | null;
  thumb: string;
  fileUrl: string;
  notes?: string;
  source: string;
  sourceLabel: string;
  importedFromLightroom?: boolean;
};

type Payload = {
  items: MediaItem[];
  summary: {
    total: number;
    photos: number;
    videos: number;
    music: number;
    lightroomReady: number;
  };
  sync?: {
    imported: number;
    lightroomDir: string;
  };
};

const libraryFilters: { key: LibraryFilter; label: string; icon: string }[] = [
  { key: "all", label: "All Library Items", icon: "🗂️" },
  { key: "photo", label: "Photos", icon: "🖼️" },
  { key: "video", label: "Videos", icon: "🎬" },
  { key: "music", label: "Audio", icon: "🎵" },
];

function statusStyle(status: MediaStatus) {
  if (status === "RAW") return { background: "rgba(251,146,60,0.16)", color: "#fdba74", border: "1px solid rgba(251,146,60,0.28)" };
  if (status === "LR") return { background: "rgba(96,165,250,0.16)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.28)" };
  if (status === "READY") return { background: "rgba(74,222,128,0.16)", color: "#86efac", border: "1px solid rgba(74,222,128,0.28)" };
  return { background: "rgba(192,132,252,0.16)", color: "#d8b4fe", border: "1px solid rgba(192,132,252,0.28)" };
}

function typeIcon(type: MediaType) {
  return type === "photo" ? "🖼️" : type === "video" ? "🎬" : "🎵";
}

function buttonStyle(active: boolean) {
  return {
    padding: "12px 14px",
    borderRadius: 14,
    marginBottom: 8,
    background: active ? "rgba(74,139,194,0.18)" : "transparent",
    border: active ? "1px solid rgba(96,165,250,0.25)" : "1px solid transparent",
    color: active ? "#f8fafc" : "#94a3b8",
    fontWeight: 700,
    width: "100%",
    textAlign: "left" as const,
    cursor: "pointer",
  };
}

function isSmartViewMatch(item: MediaItem, smartView: SmartView) {
  if (smartView === "all") return true;
  if (smartView === "work") return item.job !== "Personal Media";
  if (smartView === "personal") return item.tags.includes("personal") || item.job === "Personal Media";
  if (smartView === "travel") return item.tags.includes("travel");
  if (smartView === "social") return ["instagram", "facebook", "social"].some((tag) => item.tags.includes(tag));
  if (smartView === "edited") return item.status === "READY" || item.status === "USED";
  return item.status === "RAW" && item.tags.length <= 1;
}

export default function Page() {
  const [homeView, setHomeView] = useState<HomeView>("hq");
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("All Jobs");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [smartView, setSmartView] = useState<SmartView>("all");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightroomReady, setLightroomReady] = useState(0);
  const [selectedTags, setSelectedTags] = useState("");
  const [selectedJob, setSelectedJob] = useState("");
  const [selectedNotes, setSelectedNotes] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<MediaStatus>("RAW");
  const [lightboxOpen, setLightboxOpen] = useState(false);

  async function loadLibrary(syncLightroom = false) {
    setLoading(true);
    const endpoint = syncLightroom ? "/api/lightroom-sync" : "/api/media";
    const response = await fetch(endpoint, { method: syncLightroom ? "POST" : "GET" });
    const payload = (await response.json()) as Payload;
    setItems(payload.items);
    setLightroomReady(payload.summary.lightroomReady);
    setSelectedId((current) => current || payload.items[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => {
    loadLibrary();
  }, []);

  const jobs = useMemo(() => ["All Jobs", ...Array.from(new Set(items.map((item) => item.job))).sort()], [items]);

  const heroImage = items.find((item) => item.type === "photo")?.thumb;

  const filtered = useMemo(() => items.filter((item) => {
    const haystack = `${item.title} ${item.job} ${item.tags.join(" ")} ${item.type} ${item.status} ${item.sourceLabel}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesJob = jobFilter === "All Jobs" ? true : item.job === jobFilter;
    const matchesType = libraryFilter === "all" ? true : item.type === libraryFilter;
    const matchesSmart = isSmartViewMatch(item, smartView);
    return matchesSearch && matchesJob && matchesType && matchesSmart;
  }), [items, jobFilter, libraryFilter, search, smartView]);

  const selected = filtered.find((item) => item.id === selectedId) ?? items.find((item) => item.id === selectedId) ?? filtered[0] ?? items[0];

  useEffect(() => {
    if (!selected) return;
    setSelectedTags(selected.tags.join(", "));
    setSelectedJob(selected.job);
    setSelectedNotes(selected.notes || "");
    setSelectedStatus(selected.status);
  }, [selected?.id]);

  const stats = {
    total: filtered.length,
    photos: filtered.filter((item) => item.type === "photo").length,
    videos: filtered.filter((item) => item.type === "video").length,
    music: filtered.filter((item) => item.type === "music").length,
  };

  const sourceCards = [
    { id: "apple-photos", label: "Apple Photos", icon: "", count: items.filter((item) => item.tags.includes("personal")).length, note: "Staged personal pulls and imported images sitting in the same creative orbit.", image: heroImage },
    { id: "job-media", label: "Job Media", icon: "🏗️", count: items.filter((item) => item.job !== "Personal Media").length, note: "Live jobsite photos and progress media pulled from mission-control without touching it.", image: items.find((item) => item.source === "job-media")?.thumb || heroImage },
    { id: "lightroom", label: "Lightroom", icon: "🎞️", count: lightroomReady, note: "Watch folder imports waiting for polish, packaging, or posting.", image: items.find((item) => item.source === "lightroom")?.thumb || heroImage },
    { id: "downloads", label: "Uploads", icon: "⬇️", count: items.filter((item) => item.source === "uploads").length, note: "Drag-and-drop intake for loose media Craig wants inside the system fast.", image: items.find((item) => item.source === "uploads")?.thumb || heroImage },
  ];

  const smartViews = [
    { id: "work", label: "Work Content", icon: "🔨", count: items.filter((item) => isSmartViewMatch(item, "work")).length, note: "Job photos, videos, and field media tied to actual work.", accent: "#4A8BC2" },
    { id: "personal", label: "Personal", icon: "🧑‍🧑‍🧒", count: items.filter((item) => isSmartViewMatch(item, "personal")).length, note: "Personal images and anything tagged for life outside the jobs.", accent: "#f97316" },
    { id: "travel", label: "Travel", icon: "✈️", count: items.filter((item) => isSmartViewMatch(item, "travel")).length, note: "Trips and destination folders when those show up in the library.", accent: "#14b8a6" },
    { id: "social", label: "Social Studio", icon: "📱", count: items.filter((item) => isSmartViewMatch(item, "social")).length, note: "Instagram, Facebook, and social-ready content batches.", accent: "#ec4899" },
    { id: "edited", label: "Edited & Ready", icon: "✨", count: items.filter((item) => isSmartViewMatch(item, "edited")).length, note: "READY and USED assets ready to ship or already doing work.", accent: "#a855f7" },
    { id: "inbox", label: "Inbox / Needs Sorting", icon: "📥", count: items.filter((item) => isSmartViewMatch(item, "inbox")).length, note: "Fresh raw pulls that still need tags, notes, or direction.", accent: "#eab308" },
  ] as const;

  async function saveInspector() {
    if (!selected) return;
    const response = await fetch(`/api/media/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job: selectedJob,
        status: selectedStatus,
        notes: selectedNotes,
        tags: selectedTags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      }),
    });
    const payload = await response.json();
    setItems((current) => current.map((item) => item.id === selected.id ? payload.item : item));
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      await fetch("/api/media/upload", { method: "POST", body: form });
    }
    await loadLibrary();
    setUploading(false);
  }

  async function syncLightroom() {
    setSyncing(true);
    await loadLibrary(true);
    setSyncing(false);
  }

  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at top, rgba(59,130,246,0.18), transparent 28%), linear-gradient(180deg, #030712 0%, #08101e 45%, #020617 100%)", color: "#f8fafc" }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: 24 }}>
        <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 32, overflow: "hidden", background: "rgba(3,7,18,0.72)", backdropFilter: "blur(20px)", boxShadow: "0 30px 80px rgba(2,6,23,0.55)" }}>
          <div style={{ padding: 28, borderBottom: "1px solid rgba(148,163,184,0.12)", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", background: "linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.62) 100%)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.16em" }}>2.0</div>
              <h1 style={{ margin: "8px 0 0", fontSize: 44, lineHeight: 1, letterSpacing: "-0.03em" }}>Media HQ</h1>
              <p style={{ margin: "10px 0 0", color: "#94a3b8", maxWidth: 720, fontSize: 15 }}>Real media, real folders, actual playback. No cardboard set dressing.</p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => setHomeView("hq")} style={{ padding: "12px 16px", borderRadius: 14, border: homeView === "hq" ? "1px solid rgba(125,211,252,0.45)" : "1px solid rgba(148,163,184,0.18)", background: homeView === "hq" ? "rgba(14,165,233,0.18)" : "rgba(15,23,42,0.75)", color: "#f8fafc", fontWeight: 700 }}>Media HQ</button>
              <button onClick={() => setHomeView("library")} style={{ padding: "12px 16px", borderRadius: 14, border: homeView === "library" ? "1px solid rgba(125,211,252,0.45)" : "1px solid rgba(148,163,184,0.18)", background: homeView === "library" ? "rgba(59,130,246,0.18)" : "rgba(15,23,42,0.75)", color: "#f8fafc", fontWeight: 700 }}>Library</button>
              <button onClick={syncLightroom} disabled={syncing} style={{ padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.16)", color: "#d1fae5", fontWeight: 700 }}>{syncing ? "Syncing…" : `Lightroom Sync (${lightroomReady})`}</button>
            </div>
          </div>

          {homeView === "hq" ? (
            <div style={{ padding: 24, background: "linear-gradient(180deg, rgba(2,6,23,0.25) 0%, rgba(2,6,23,0.55) 100%)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18 }}>
                <div style={{ position: "relative", borderRadius: 28, overflow: "hidden", minHeight: 360, border: "1px solid rgba(148,163,184,0.14)", background: "#0f172a" }}>
                  {heroImage ? <img src={heroImage} alt="Hero media" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.6) saturate(1.1)" }} /> : null}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(2,6,23,0.86) 10%, rgba(15,23,42,0.44) 52%, rgba(2,6,23,0.88) 100%)" }} />
                  <div style={{ position: "relative", zIndex: 1, padding: 28, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 360 }}>
                    <div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, background: "rgba(14,165,233,0.14)", border: "1px solid rgba(125,211,252,0.22)", color: "#bae6fd", fontWeight: 700, fontSize: 13 }}>Creative Command Center</div>
                      <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 0.98, letterSpacing: "-0.04em", marginTop: 16, maxWidth: 760 }}>Craig&apos;s actual media stack, finally behaving like a media stack.</div>
                      <p style={{ marginTop: 14, maxWidth: 640, color: "#cbd5e1", fontSize: 16, lineHeight: 1.7 }}>Filesystem scan, Lightroom watch folder, job-photo bridge, uploads, playback, and inspector edits all tied together.</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                      {[
                        { label: "Library", value: String(items.length), note: "tracked items" },
                        { label: "Photos", value: String(items.filter((item) => item.type === "photo").length), note: "real images" },
                        { label: "Video", value: String(items.filter((item) => item.type === "video").length), note: "playable clips" },
                        { label: "Audio", value: String(items.filter((item) => item.type === "music").length), note: "inline playback" },
                      ].map((stat) => (
                        <div key={stat.label} style={{ borderRadius: 18, padding: 16, background: "rgba(15,23,42,0.74)", border: "1px solid rgba(148,163,184,0.14)", backdropFilter: "blur(8px)" }}>
                          <div style={{ fontSize: 11, color: "#7dd3fc", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>{stat.label}</div>
                          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>{stat.value}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{stat.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 18 }}>
                  <div style={{ borderRadius: 24, border: "1px solid rgba(148,163,184,0.14)", background: "linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(2,6,23,0.82) 100%)", padding: 22 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.12em" }}>Now Playing</div>
                    <div style={{ fontSize: 28, fontWeight: 900, marginTop: 10 }}>Live folders, not fake seed data.</div>
                    <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                      {[
                        `${items.filter((item) => item.source === "job-media").length} job media items bridged in from mission-control`,
                        `${lightroomReady} Lightroom exports ready from the watch folder`,
                        `${items.filter((item) => item.source === "uploads").length} local uploads saved inside the app`,
                      ].map((item, index) => (
                        <div key={item} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 16, background: index === 0 ? "rgba(14,165,233,0.12)" : "rgba(15,23,42,0.58)", border: "1px solid rgba(148,163,184,0.12)" }}>
                          <div style={{ width: 28, height: 28, borderRadius: 999, background: index === 0 ? "#0ea5e9" : "rgba(148,163,184,0.22)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, flexShrink: 0 }}>{index + 1}</div>
                          <div style={{ color: "#cbd5e1", lineHeight: 1.5 }}>{item}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ borderRadius: 24, border: "1px solid rgba(148,163,184,0.14)", background: "linear-gradient(135deg, rgba(91,33,182,0.18), rgba(15,23,42,0.78))", padding: 22 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#c4b5fd", textTransform: "uppercase", letterSpacing: "0.12em" }}>Current Taste Level</div>
                    <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>Still the pretty shell. Now with teeth.</div>
                    <p style={{ color: "#cbd5e1", marginTop: 10, lineHeight: 1.6 }}>Inspector edits persist to JSON, smart views are real, and media opens into actual video/audio/photo playback.</p>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
                <div style={{ borderRadius: 24, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.56)", padding: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.12em" }}>Sources</div>
                      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>Choose where you want to enter</div>
                    </div>
                    <button onClick={() => setHomeView("library")} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.75)", color: "#f8fafc", fontWeight: 700 }}>Open Library</button>
                  </div>
                  <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
                    {sourceCards.map((card) => (
                      <div key={card.id} style={{ position: "relative", borderRadius: 22, overflow: "hidden", minHeight: 148, border: "1px solid rgba(148,163,184,0.14)", background: "#0f172a" }}>
                        {card.image ? <img src={card.image} alt={card.label} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.52) saturate(1.08)" }} /> : null}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(2,6,23,0.88) 0%, rgba(2,6,23,0.56) 46%, rgba(2,6,23,0.86) 100%)" }} />
                        <div style={{ position: "relative", zIndex: 1, padding: 18, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", minHeight: 148 }}>
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 800 }}>{card.icon} {card.label}</div>
                            <div style={{ color: "#cbd5e1", marginTop: 8, maxWidth: 460, lineHeight: 1.55 }}>{card.note}</div>
                          </div>
                          <div style={{ textAlign: "right", minWidth: 72 }}>
                            <div style={{ fontSize: 34, fontWeight: 900 }}>{card.count.toLocaleString()}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: 800, letterSpacing: "0.12em" }}>items</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderRadius: 24, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(2,6,23,0.56)", padding: 22 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.12em" }}>Smart Views</div>
                    <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>Start with intent, not the pile</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginTop: 18 }}>
                    {smartViews.map((view) => (
                      <button key={view.id} onClick={() => { setSmartView(view.id); setHomeView("library"); }} style={{ borderRadius: 22, border: `1px solid ${view.accent}33`, background: `linear-gradient(180deg, ${view.accent}18 0%, rgba(15,23,42,0.82) 65%)`, padding: 18, minHeight: 188, color: "#fff", textAlign: "left" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontSize: 18, fontWeight: 800 }}>{view.icon} {view.label}</div>
                          <div style={{ fontSize: 13, color: view.accent, fontWeight: 800 }}>{view.count.toLocaleString()}</div>
                        </div>
                        <div style={{ fontSize: 34, fontWeight: 900, marginTop: 18, letterSpacing: "-0.03em" }}>{view.count.toLocaleString()}</div>
                        <div style={{ color: "#cbd5e1", marginTop: 12, lineHeight: 1.55 }}>{view.note}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: 20, borderBottom: "1px solid rgba(148,163,184,0.12)", background: "rgba(2,6,23,0.64)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px 220px", gap: 12 }}>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by job, filename, tag, type, or status..." style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.82)", color: "#f8fafc" }} />
                  <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.82)", color: "#f8fafc" }}>
                    {jobs.map((job) => <option key={job}>{job}</option>)}
                  </select>
                  <label style={{ display: "grid", placeItems: "center", padding: "14px 16px", borderRadius: 14, border: "1px dashed rgba(125,211,252,0.35)", background: "rgba(14,165,233,0.08)", color: "#e0f2fe", fontWeight: 700, cursor: "pointer" }}>
                    {uploading ? "Uploading…" : "Upload Files"}
                    <input type="file" multiple style={{ display: "none" }} onChange={(e) => uploadFiles(e.target.files)} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                  {libraryFilters.map((filter) => (
                    <button key={filter.key} onClick={() => setLibraryFilter(filter.key)} style={{ padding: "10px 14px", borderRadius: 999, border: libraryFilter === filter.key ? "1px solid rgba(125,211,252,0.4)" : "1px solid rgba(148,163,184,0.18)", background: libraryFilter === filter.key ? "rgba(14,165,233,0.16)" : "rgba(15,23,42,0.8)", color: "#f8fafc", fontWeight: 700 }}>
                      {filter.icon} {filter.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
                  {[
                    { label: "Showing", value: String(stats.total) },
                    { label: "Photos", value: String(stats.photos) },
                    { label: "Videos", value: String(stats.videos) },
                    { label: "Audio", value: String(stats.music) },
                  ].map((stat) => (
                    <div key={stat.label} style={{ borderRadius: 16, padding: 14, background: "rgba(15,23,42,0.82)", border: "1px solid rgba(148,163,184,0.14)" }}>
                      <div style={{ fontSize: 11, color: "#7dd3fc", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>{stat.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr) 360px" }}>
                <aside style={{ borderRight: "1px solid rgba(148,163,184,0.12)", padding: 16, background: "rgba(2,6,23,0.62)" }}>
                  <button onClick={() => setSmartView("all")} style={buttonStyle(smartView === "all")}>✨ Everything</button>
                  {smartViews.map((item) => (
                    <button key={item.id} onClick={() => setSmartView(item.id)} style={buttonStyle(smartView === item.id)}>{item.icon} {item.label}</button>
                  ))}
                </aside>

                <section style={{ padding: 20, background: "rgba(3,7,18,0.58)" }}>
                  {loading ? (
                    <div style={{ borderRadius: 22, border: "1px dashed rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.65)", padding: 36, textAlign: "center", color: "#94a3b8" }}>Loading the library…</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ borderRadius: 22, border: "1px dashed rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.65)", padding: 36, textAlign: "center", color: "#94a3b8" }}>No media matches that filter yet.</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                      {filtered.map((item) => (
                        <button key={item.id} onClick={() => setSelectedId(item.id)} onDoubleClick={() => setLightboxOpen(true)} style={{ borderRadius: 22, overflow: "hidden", border: selected?.id === item.id ? "1px solid rgba(125,211,252,0.45)" : "1px solid rgba(148,163,184,0.12)", boxShadow: selected?.id === item.id ? "0 20px 35px rgba(14,165,233,0.12)" : "0 14px 24px rgba(2,6,23,0.32)", background: "rgba(15,23,42,0.76)", padding: 0, textAlign: "left", color: "#fff" }}>
                          <div style={{ position: "relative", aspectRatio: "4 / 3", overflow: "hidden", background: "#0f172a" }}>
                            <img src={item.thumb} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(2,6,23,0.08) 0%, rgba(2,6,23,0.36) 100%)" }} />
                            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ ...statusStyle(item.status), fontSize: 12, padding: "6px 10px", borderRadius: 999, fontWeight: 700 }}>{item.status}</span>
                              <span style={{ background: "rgba(15,23,42,0.72)", color: "#f8fafc", fontSize: 12, padding: "6px 10px", borderRadius: 999, fontWeight: 700, border: "1px solid rgba(148,163,184,0.16)" }}>{typeIcon(item.type)} {item.type}</span>
                            </div>
                            {item.type === "video" ? <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 46 }}>▶️</span> : null}
                            {item.duration ? <span style={{ position: "absolute", right: 12, bottom: 12, background: "rgba(2,6,23,0.82)", color: "#fff", fontSize: 12, padding: "6px 10px", borderRadius: 10, fontWeight: 700 }}>{item.duration}</span> : null}
                          </div>
                          <div style={{ padding: 16 }}>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{item.title}</div>
                            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{item.job} · {item.sourceLabel}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{item.tags.map((tag) => <span key={tag} style={{ fontSize: 11, padding: "6px 10px", borderRadius: 999, background: "rgba(15,23,42,0.82)", color: "#cbd5e1", border: "1px solid rgba(148,163,184,0.12)" }}>#{tag}</span>)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <aside style={{ borderLeft: "1px solid rgba(148,163,184,0.12)", padding: 20, background: "rgba(2,6,23,0.62)" }}>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>Inspector</div>
                  <div style={{ color: "#94a3b8", marginTop: 4 }}>Selected media details and quick actions.</div>
                  {selected ? (
                    <>
                      <div style={{ marginTop: 16, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.78)" }}>
                        {selected.type === "photo" ? (
                          <img src={selected.fileUrl} alt={selected.title} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", cursor: "pointer" }} onClick={() => setLightboxOpen(true)} />
                        ) : selected.type === "video" ? (
                          <video controls src={selected.fileUrl} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover" }} />
                        ) : (
                          <div style={{ padding: 20 }}>
                            <div style={{ width: "100%", aspectRatio: "4 / 3", display: "grid", placeItems: "center", background: "linear-gradient(180deg, rgba(30,41,59,0.92), rgba(15,23,42,1))", color: "#cbd5e1", fontSize: 60 }}>🎵</div>
                            <audio controls src={selected.fileUrl} style={{ width: "100%", marginTop: 12 }} />
                          </div>
                        )}
                        <div style={{ padding: 16 }}>
                          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                            <span style={{ ...statusStyle(selected.status), fontSize: 12, padding: "6px 10px", borderRadius: 999, fontWeight: 700 }}>{selected.status}</span>
                            <span style={{ background: "rgba(15,23,42,0.82)", color: "#f8fafc", fontSize: 12, padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(148,163,184,0.14)" }}>{typeIcon(selected.type)} {selected.type}</span>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>{selected.title}</div>
                          <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}>{selected.job}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                        {[ ["Date", new Date(selected.date).toLocaleString()], ["Size", selected.size], ["Duration", selected.duration || "-"], ["Source", selected.sourceLabel] ].map(([label, value]) => (
                          <div key={label} style={{ borderRadius: 14, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(15,23,42,0.78)", padding: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
                            <div style={{ marginTop: 6, fontWeight: 700 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                        <input value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)} placeholder="Linked job / collection" style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.82)", color: "#f8fafc" }} />
                        <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as MediaStatus)} style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.82)", color: "#f8fafc" }}>
                          {(["RAW", "LR", "READY", "USED"] as MediaStatus[]).map((status) => <option key={status}>{status}</option>)}
                        </select>
                        <input value={selectedTags} onChange={(e) => setSelectedTags(e.target.value)} placeholder="tags, comma, separated" style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.82)", color: "#f8fafc" }} />
                        <textarea value={selectedNotes} onChange={(e) => setSelectedNotes(e.target.value)} placeholder="Notes" rows={4} style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.18)", background: "rgba(15,23,42,0.82)", color: "#f8fafc", resize: "vertical" }} />
                        <button onClick={saveInspector} style={{ padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(74,222,128,0.24)", background: "rgba(34,197,94,0.16)", color: "#bbf7d0", fontWeight: 700 }}>Save metadata</button>
                      </div>
                    </>
                  ) : null}
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
      {lightboxOpen && selected ? (
        <div onClick={() => setLightboxOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.92)", display: "grid", placeItems: "center", padding: 32, zIndex: 20 }}>
          {selected.type === "photo" ? <img src={selected.fileUrl} alt={selected.title} style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" }} /> : selected.type === "video" ? <video controls autoPlay src={selected.fileUrl} style={{ maxWidth: "92vw", maxHeight: "88vh" }} /> : <audio controls autoPlay src={selected.fileUrl} style={{ width: "min(700px, 92vw)" }} />}
        </div>
      ) : null}
    </main>
  );
}
