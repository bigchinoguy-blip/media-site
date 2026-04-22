import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type MediaType = "photo" | "video" | "music";
export type MediaStatus = "RAW" | "LR" | "READY" | "USED";

export type MediaRecord = {
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
  relativePath: string;
  absolutePath: string;
  extension: string;
  importedFromLightroom?: boolean;
};

type StoredMetadata = Record<string, Partial<MediaRecord> & { id?: string }>;

type ScanSource = {
  id: string;
  label: string;
  root: string;
  type: "job" | "staging" | "lightroom" | "upload" | "audio";
  readOnly?: boolean;
};

const WORKSPACE = "/Users/veronicaoneill/.openclaw/workspace";
const APP_ROOT = path.join(WORKSPACE, "2.0");
const DATA_DIR = path.join(APP_ROOT, "data");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const THUMBS_DIR = path.join(PUBLIC_DIR, "generated-thumbs");
const LIBRARY_FILE = path.join(DATA_DIR, "media-library.json");
const LIGHTROOM_DIR = path.join(process.env.HOME || "", "Desktop", "Lightroom-Exports");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac"]);

const SCAN_SOURCES: ScanSource[] = [
  {
    id: "job-media",
    label: "Job Media",
    root: path.join(WORKSPACE, "mission-control", "public", "job-photos"),
    type: "job",
    readOnly: true,
  },
  { id: "staging-1", label: "Photo Staging", root: path.join(process.env.HOME || "", "photo_staging_3"), type: "staging" },
  { id: "staging-2", label: "Review 20", root: path.join(process.env.HOME || "", "review20"), type: "staging" },
  { id: "staging-3", label: "Recent Review", root: path.join(process.env.HOME || "", "photos_review_recent"), type: "staging" },
  { id: "lightroom", label: "Lightroom", root: LIGHTROOM_DIR, type: "lightroom" },
  { id: "uploads", label: "Uploads", root: UPLOADS_DIR, type: "upload" },
  { id: "garageband", label: "GarageBand", root: path.join(process.env.HOME || "", "Music", "GarageBand"), type: "audio" },
  { id: "logic", label: "Logic", root: path.join(process.env.HOME || "", "Music", "Logic"), type: "audio" },
];

async function exists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(THUMBS_DIR, { recursive: true });
  await fs.mkdir(LIGHTROOM_DIR, { recursive: true });
  if (!(await exists(LIBRARY_FILE))) {
    await fs.writeFile(LIBRARY_FILE, JSON.stringify({}, null, 2));
  }
}

async function loadStoredMetadata(): Promise<StoredMetadata> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(LIBRARY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveStoredMetadata(data: StoredMetadata) {
  await ensureDirs();
  await fs.writeFile(LIBRARY_FILE, JSON.stringify(data, null, 2));
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function titleize(input: string) {
  return input
    .replace(/[-_]+/g, " ")
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatSeconds(totalSeconds?: number | null) {
  if (!totalSeconds || !Number.isFinite(totalSeconds)) return null;
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function deriveType(ext: string): MediaType | null {
  if (IMAGE_EXTENSIONS.has(ext)) return "photo";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "music";
  return null;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (entry.isFile()) return [full];
    return [];
  }));
  return files.flat();
}

async function getVideoDuration(filePath: string) {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath]);
    return Number.parseFloat(stdout.trim()) || null;
  } catch {
    return null;
  }
}

async function ensureVideoThumb(id: string, filePath: string) {
  const filename = `${id}.jpg`;
  const absoluteThumb = path.join(THUMBS_DIR, filename);
  const publicUrl = `/generated-thumbs/${filename}`;
  if (await exists(absoluteThumb)) return publicUrl;
  try {
    await execFileAsync("ffmpeg", ["-y", "-ss", "00:00:01", "-i", filePath, "-vframes", "1", absoluteThumb]);
    return publicUrl;
  } catch {
    return "";
  }
}

function buildId(sourceId: string, relativePath: string) {
  return crypto.createHash("md5").update(`${sourceId}:${relativePath}`).digest("hex").slice(0, 12);
}

function fileUrlForId(id: string, kind: "file" | "thumb" = "file") {
  return `/api/media/${id}/${kind}`;
}

function inferJob(source: ScanSource, relativePath: string, title: string, tags: string[]) {
  if (source.type === "job") {
    const topLevel = relativePath.split(path.sep)[0] || "";
    const cleaned = topLevel.replace(/^job-/, "");
    return titleize(cleaned || title);
  }
  if (tags.includes("personal")) return "Personal Media";
  return source.type === "audio" ? source.label : "Personal Media";
}

function inferTags(source: ScanSource, relativePath: string) {
  const lower = relativePath.toLowerCase();
  const tags = new Set<string>();
  if (source.type === "job") tags.add("work");
  if (source.type === "lightroom") tags.add("edited");
  if (source.type === "audio") tags.add("audio");
  if (source.type === "upload") tags.add("upload");
  if (source.type === "staging") tags.add("personal");
  if (lower.includes("travel")) tags.add("travel");
  if (lower.includes("instagram") || lower.includes("facebook") || lower.includes("social")) tags.add("social");
  if (lower.includes("instagram")) tags.add("instagram");
  if (lower.includes("facebook")) tags.add("facebook");
  return [...tags];
}

async function buildRecord(source: ScanSource, absolutePath: string, stored: StoredMetadata): Promise<MediaRecord | null> {
  const stat = await fs.stat(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const type = deriveType(ext);
  if (!type) return null;

  const relativePath = path.relative(source.root, absolutePath);
  if (!relativePath || relativePath.startsWith("..")) return null;
  const id = buildId(source.id, relativePath);
  const saved = stored[id] || {};
  const filename = path.basename(absolutePath);
  const title = (saved.title as string) || titleize(filename);
  const autoTags = inferTags(source, relativePath);
  const tags = Array.from(new Set([...(saved.tags || []), ...autoTags].filter(Boolean))) as string[];
  const job = (saved.job as string) || inferJob(source, relativePath, title, tags);
  const status = (saved.status as MediaStatus) || (source.type === "lightroom" ? "LR" : source.type === "job" ? "READY" : "RAW");
  const durationSeconds = type === "video" || type === "music" ? await getVideoDuration(absolutePath) : null;
  const fileUrl = fileUrlForId(id, "file");
  const thumb = type === "photo" ? fileUrlForId(id, "thumb") : type === "video" ? (await ensureVideoThumb(id, absolutePath)) || fileUrlForId(id, "thumb") : fileUrlForId(id, "thumb");

  return {
    id,
    title,
    type,
    status,
    job,
    date: (saved.date as string) || stat.mtime.toISOString(),
    tags,
    size: formatBytes(stat.size),
    duration: (saved.duration as string) || formatSeconds(durationSeconds),
    thumb,
    fileUrl,
    notes: (saved.notes as string) || "",
    source: source.id,
    sourceLabel: source.label,
    relativePath,
    absolutePath,
    extension: ext,
    importedFromLightroom: source.type === "lightroom",
  };
}

export async function getLibrary() {
  await ensureDirs();
  const stored = await loadStoredMetadata();
  const items: MediaRecord[] = [];

  for (const source of SCAN_SOURCES) {
    if (!(await exists(source.root))) continue;
    const files = await walk(source.root);
    for (const file of files) {
      if (path.basename(file).toLowerCase() === "meta.json") continue;
      const record = await buildRecord(source, file, stored);
      if (record) items.push(record);
    }
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const nextStored: StoredMetadata = { ...stored };
  for (const item of items) {
    nextStored[item.id] = {
      ...(nextStored[item.id] || {}),
      id: item.id,
      title: item.title,
      status: item.status,
      job: item.job,
      tags: item.tags,
      date: item.date,
      duration: item.duration,
      notes: item.notes,
      source: item.source,
      sourceLabel: item.sourceLabel,
      relativePath: item.relativePath,
      absolutePath: item.absolutePath,
      fileUrl: item.fileUrl,
      thumb: item.thumb,
      type: item.type,
      size: item.size,
      importedFromLightroom: item.importedFromLightroom,
    };
  }
  await saveStoredMetadata(nextStored);
  return items;
}

export async function getLibrarySummary() {
  const items = await getLibrary();
  const total = items.length;
  const photos = items.filter((item) => item.type === "photo").length;
  const videos = items.filter((item) => item.type === "video").length;
  const music = items.filter((item) => item.type === "music").length;
  const lightroomReady = items.filter((item) => item.source === "lightroom").length;
  return { items, summary: { total, photos, videos, music, lightroomReady } };
}

export async function updateMediaRecord(id: string, patch: Partial<Pick<MediaRecord, "title" | "status" | "job" | "tags" | "notes" | "date">>) {
  const stored = await loadStoredMetadata();
  stored[id] = {
    ...(stored[id] || {}),
    ...patch,
    tags: patch.tags ? Array.from(new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))) : stored[id]?.tags,
  };
  await saveStoredMetadata(stored);
  const items = await getLibrary();
  return items.find((item) => item.id === id) || null;
}

export async function getMediaById(id: string) {
  const items = await getLibrary();
  return items.find((item) => item.id === id) || null;
}

export async function importLightroomExports() {
  await ensureDirs();
  const items = await getLibrary();
  const count = items.filter((item) => item.source === "lightroom").length;
  return { imported: count, lightroomDir: LIGHTROOM_DIR };
}

export async function saveUpload(fileName: string, bytes: ArrayBuffer) {
  await ensureDirs();
  const safeName = `${Date.now()}-${slugify(path.basename(fileName, path.extname(fileName)))}${path.extname(fileName).toLowerCase() || ".bin"}`;
  const target = path.join(UPLOADS_DIR, safeName);
  await fs.writeFile(target, Buffer.from(bytes));
  const items = await getLibrary();
  return items.find((item) => item.absolutePath === target) || null;
}

export function getContentType(ext: string) {
  if (IMAGE_EXTENSIONS.has(ext)) return ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
  if (VIDEO_EXTENSIONS.has(ext)) return ext === ".mov" ? "video/quicktime" : "video/mp4";
  if (AUDIO_EXTENSIONS.has(ext)) return ext === ".wav" ? "audio/wav" : ext === ".m4a" || ext === ".aac" ? "audio/mp4" : "audio/mpeg";
  return "application/octet-stream";
}

export { LIBRARY_FILE, LIGHTROOM_DIR, SCAN_SOURCES };
