import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type MediaType = "photo" | "video" | "music";
export type MediaStatus = "RAW" | "LR" | "READY" | "USED";
export type MediaTag = "work" | "personal" | "travel" | "social";

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
  hash?: string;
  needsTagging?: boolean;
};

type StoredMetadata = Record<string, Partial<MediaRecord> & { id?: string; hash?: string; needsTagging?: boolean }>;

type ScanSource = {
  id: string;
  label: string;
  root: string;
  type: "job" | "staging" | "lightroom" | "inbox" | "upload" | "audio" | "hub";
  readOnly?: boolean;
  priority: number;
};

type UploadTagInput = {
  tag?: MediaTag | "skip";
  job?: string;
  label?: string;
};

const WORKSPACE = "/Users/veronicaoneill/.openclaw/workspace";
const APP_ROOT = path.join(WORKSPACE, "2.0");
const DATA_DIR = path.join(APP_ROOT, "data");
const PUBLIC_DIR = path.join(APP_ROOT, "public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");
const HUB_UPLOADS_DIR = path.join(UPLOADS_DIR, "from-hub");
const THUMBS_DIR = path.join(PUBLIC_DIR, "generated-thumbs");
const LIBRARY_FILE = path.join(DATA_DIR, "media-library.json");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const LIGHTROOM_DIR = path.join(process.env.HOME || "", "Desktop", "Lightroom-Exports");
const GALLERY_INBOX_DIR = path.join(process.env.HOME || "", "Gallery-Inbox");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac"]);

const SCAN_SOURCES: ScanSource[] = [
  {
    id: "gallery-inbox",
    label: "Gallery Inbox",
    root: GALLERY_INBOX_DIR,
    type: "inbox",
    priority: 0,
  },
  {
    id: "job-media",
    label: "Job Media",
    root: path.join(WORKSPACE, "mission-control", "public", "job-photos"),
    type: "job",
    readOnly: true,
    priority: 1,
  },
  { id: "staging-1", label: "Photo Staging", root: path.join(process.env.HOME || "", "photo_staging_3"), type: "staging", priority: 3 },
  { id: "staging-2", label: "Review 20", root: path.join(process.env.HOME || "", "review20"), type: "staging", priority: 4 },
  { id: "staging-3", label: "Recent Review", root: path.join(process.env.HOME || "", "photos_review_recent"), type: "staging", priority: 5 },
  { id: "lightroom", label: "Lightroom", root: LIGHTROOM_DIR, type: "lightroom", priority: 2 },
  { id: "uploads", label: "Uploads", root: UPLOADS_DIR, type: "upload", priority: 2 },
  { id: "hub-imports", label: "Hub Transfers", root: HUB_UPLOADS_DIR, type: "hub", priority: 2 },
  { id: "garageband", label: "GarageBand", root: path.join(process.env.HOME || "", "Music", "GarageBand"), type: "audio", priority: 6 },
  { id: "logic", label: "Logic", root: path.join(process.env.HOME || "", "Music", "Logic"), type: "audio", priority: 7 },
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
  await fs.mkdir(HUB_UPLOADS_DIR, { recursive: true });
  await fs.mkdir(THUMBS_DIR, { recursive: true });
  await fs.mkdir(LIGHTROOM_DIR, { recursive: true });
  await fs.mkdir(GALLERY_INBOX_DIR, { recursive: true });
  if (!(await exists(LIBRARY_FILE))) {
    await fs.writeFile(LIBRARY_FILE, JSON.stringify({}, null, 2));
  }
  if (!(await exists(JOBS_FILE))) {
    await fs.writeFile(JOBS_FILE, JSON.stringify([], null, 2));
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
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
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

async function hashFileHead(filePath: string) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return crypto.createHash("sha256").update(buffer.subarray(0, bytesRead)).digest("hex");
  } finally {
    await handle.close();
  }
}

function buildId(seed: string) {
  return crypto.createHash("md5").update(seed).digest("hex").slice(0, 12);
}

function fileUrlForId(id: string, kind: "file" | "thumb" = "file") {
  return `/api/media/${id}/${kind}`;
}

function sanitizeTag(tag?: string) {
  return tag?.trim().toLowerCase() || "";
}

function applyTagSelection(source: ScanSource, existing: string[], input?: UploadTagInput, sourceLabel?: string) {
  const tags = new Set(existing.map(sanitizeTag).filter(Boolean));
  const chosen = sanitizeTag(input?.tag);
  const job = input?.job?.trim() || "";
  const label = input?.label?.trim() || "";

  if (source.type === "job" || chosen === "work" || source.type === "hub") tags.add("work");
  if (source.type === "lightroom") tags.add("edited");
  if (source.type === "staging") tags.add("personal");
  if (source.type === "audio") tags.add("audio");
  if (source.type === "upload") tags.add("upload");
  if (source.type === "inbox") tags.add("inbox");
  if (source.type === "hub") tags.add("hub");
  if (sourceLabel) tags.add(sourceLabel.toLowerCase().replace(/\s+/g, "-"));
  if (["work", "personal", "travel", "social"].includes(chosen)) tags.add(chosen);
  if (chosen === "social") tags.add("social");
  if (job) tags.add(job.toLowerCase());
  if (label) tags.add(label.toLowerCase());
  return Array.from(tags);
}

function inferJob(source: ScanSource, relativePath: string, title: string, tags: string[], input?: UploadTagInput) {
  if (input?.job?.trim()) return input.job.trim();
  if (source.type === "job") {
    const topLevel = relativePath.split(path.sep)[0] || "";
    const cleaned = topLevel.replace(/^job-/, "");
    return titleize(cleaned || title);
  }
  if (tags.includes("work")) return "Work Media";
  if (tags.includes("personal")) return "Personal Media";
  return source.type === "audio" ? source.label : "Personal Media";
}

async function buildRecord(source: ScanSource, absolutePath: string, stored: StoredMetadata, hashIndex: Map<string, string>, options?: { tagInput?: UploadTagInput; sourceLabel?: string }) {
  const stat = await fs.stat(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const type = deriveType(ext);
  if (!type) return null;

  const relativePath = path.relative(source.root, absolutePath);
  if (!relativePath || relativePath.startsWith("..")) return null;

  const hash = await hashFileHead(absolutePath);
  const existingIdForHash = hashIndex.get(hash);
  const legacyId = buildId(`${source.id}:${relativePath}`);
  const savedForLegacy = stored[legacyId] || {};
  const savedForHash = existingIdForHash ? stored[existingIdForHash] || {} : {};
  const id = existingIdForHash || (savedForHash.id as string) || (savedForLegacy.id as string) || buildId(hash);
  const saved = { ...savedForLegacy, ...savedForHash };

  if (existingIdForHash && saved.absolutePath && saved.absolutePath !== absolutePath) {
    return null;
  }

  const filename = path.basename(absolutePath);
  const title = (saved.title as string) || titleize(filename);
  const tags = applyTagSelection(source, (saved.tags as string[]) || [], options?.tagInput, options?.sourceLabel);
  const lowerPath = relativePath.toLowerCase();
  if (lowerPath.includes("travel")) tags.push("travel");
  if (lowerPath.includes("instagram") || lowerPath.includes("facebook") || lowerPath.includes("social")) tags.push("social");
  const finalTags = Array.from(new Set(tags.filter(Boolean)));
  const job = (saved.job as string) || inferJob(source, relativePath, title, finalTags, options?.tagInput);
  const status = (saved.status as MediaStatus) || (source.type === "job" || source.type === "hub" ? "READY" : source.type === "lightroom" ? "LR" : "RAW");
  const durationSeconds = type === "video" || type === "music" ? await getVideoDuration(absolutePath) : null;
  const fileUrl = fileUrlForId(id, "file");
  const thumb = type === "photo" ? fileUrlForId(id, "thumb") : type === "video" ? (await ensureVideoThumb(id, absolutePath)) || fileUrlForId(id, "thumb") : fileUrlForId(id, "thumb");
  const needsTagging = Boolean(saved.needsTagging) || (source.type === "inbox" && finalTags.filter((tag) => ["work", "personal", "travel", "social"].includes(tag)).length === 0);

  hashIndex.set(hash, id);

  return {
    id,
    title,
    type,
    status,
    job,
    date: (saved.date as string) || stat.mtime.toISOString(),
    tags: finalTags,
    size: formatBytes(stat.size),
    duration: (saved.duration as string) || formatSeconds(durationSeconds),
    thumb,
    fileUrl,
    notes: (saved.notes as string) || "",
    source: source.id,
    sourceLabel: options?.sourceLabel || source.label,
    relativePath,
    absolutePath,
    extension: ext,
    importedFromLightroom: false,
    hash,
    needsTagging,
  } satisfies MediaRecord;
}

async function persistLibraryItems(items: MediaRecord[], stored: StoredMetadata) {
  const nextStored: StoredMetadata = {};
  for (const item of items) {
    nextStored[item.id] = {
      ...(stored[item.id] || {}),
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
      hash: item.hash,
      needsTagging: item.needsTagging,
    };
  }
  await saveStoredMetadata(nextStored);
  return nextStored;
}

export async function getJobOptions() {
  await ensureDirs();
  let localJobs: string[] = [];
  try {
    const raw = await fs.readFile(JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      localJobs = parsed.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean);
    }
  } catch {}
  const stored = await loadStoredMetadata();
  const storedJobs = Object.values(stored).map((item) => item.job).filter((job): job is string => Boolean(job));
  return Array.from(new Set([...localJobs, ...storedJobs].filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export async function getLibrary() {
  await ensureDirs();
  const stored = await loadStoredMetadata();
  const items: MediaRecord[] = [];
  const hashIndex = new Map<string, string>();
  const sources = [...SCAN_SOURCES].sort((a, b) => a.priority - b.priority);

  const savedWithHashes = Object.values(stored)
    .filter((item): item is Partial<MediaRecord> & { id: string; hash: string } => Boolean(item.id && item.hash))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  for (const item of savedWithHashes) {
    hashIndex.set(item.hash, item.id);
  }

  for (const source of sources) {
    if (!(await exists(source.root))) continue;
    const files = await walk(source.root);
    for (const file of files) {
      if (path.basename(file).toLowerCase() === "meta.json") continue;
      const record = await buildRecord(source, file, stored, hashIndex);
      if (record) items.push(record);
    }
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  await persistLibraryItems(items, stored);
  return items;
}

export async function getLibrarySummary() {
  const items = await getLibrary();
  const total = items.length;
  const photos = items.filter((item) => item.type === "photo").length;
  const videos = items.filter((item) => item.type === "video").length;
  const music = items.filter((item) => item.type === "music").length;
  const lightroomReady = items.filter((item) => item.source === "lightroom").length;
  const inboxCount = items.filter((item) => item.source === "gallery-inbox").length;
  return { items, summary: { total, photos, videos, music, lightroomReady, inboxCount }, jobs: await getJobOptions(), inboxPath: GALLERY_INBOX_DIR };
}

export async function updateMediaRecord(id: string, patch: Partial<Pick<MediaRecord, "title" | "status" | "job" | "tags" | "notes" | "date" | "needsTagging">>) {
  const stored = await loadStoredMetadata();
  stored[id] = {
    ...(stored[id] || {}),
    ...patch,
    tags: patch.tags ? Array.from(new Set(patch.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))) : stored[id]?.tags,
    needsTagging: patch.needsTagging ?? (stored[id]?.needsTagging as boolean | undefined),
  };
  await saveStoredMetadata(stored);
  const items = await getLibrary();
  return items.find((item) => item.id === id) || null;
}

export async function applyTagPrompt(id: string, input: UploadTagInput) {
  const item = await getMediaById(id);
  if (!item) return null;
  const tags = applyTagSelection({ id: item.source, label: item.sourceLabel, root: path.dirname(item.absolutePath), type: item.source === "gallery-inbox" ? "inbox" : item.source === "hub-imports" ? "hub" : item.source === "uploads" ? "upload" : "staging", priority: 0 }, item.tags, input);
  return updateMediaRecord(id, {
    tags,
    job: input.job?.trim() || (tags.includes("work") ? item.job === "Personal Media" ? "Work Media" : item.job : item.job),
    needsTagging: false,
  });
}

export async function getMediaById(id: string) {
  const items = await getLibrary();
  return items.find((item) => item.id === id) || null;
}

export async function importGalleryInbox() {
  const items = await getLibrary();
  const count = items.filter((item) => item.source === "gallery-inbox").length;
  return { imported: count, inboxDir: GALLERY_INBOX_DIR };
}

export async function importLightroomExports() {
  await ensureDirs();
  const items = await getLibrary();
  const count = items.filter((item) => item.source === "lightroom").length;
  return { imported: count, lightroomDir: LIGHTROOM_DIR };
}

export async function saveUpload(fileName: string, bytes: ArrayBuffer, input?: UploadTagInput) {
  await ensureDirs();
  const safeName = `${Date.now()}-${slugify(path.basename(fileName, path.extname(fileName)))}${path.extname(fileName).toLowerCase() || ".bin"}`;
  const target = path.join(UPLOADS_DIR, safeName);
  await fs.writeFile(target, Buffer.from(bytes));

  const stored = await loadStoredMetadata();
  const hashIndex = new Map<string, string>(Object.values(stored).flatMap((item) => item.hash && item.id ? [[item.hash, item.id]] : []));
  const source = SCAN_SOURCES.find((item) => item.id === "uploads")!;
  const record = await buildRecord(source, target, stored, hashIndex, { tagInput: input, sourceLabel: source.label });
  if (!record) return null;
  record.needsTagging = false;
  await persistLibraryItems([...(await getLibrary()).filter((item) => item.id !== record.id), record].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), stored);
  return await getMediaById(record.id);
}

export async function receiveFromHub(input: { sourcePath: string; jobName?: string; jobId?: string; label?: string }) {
  await ensureDirs();
  const ext = path.extname(input.sourcePath).toLowerCase() || ".bin";
  const base = path.basename(input.sourcePath, ext);
  const safeName = `${Date.now()}-${slugify(base)}${ext}`;
  const target = path.join(HUB_UPLOADS_DIR, safeName);
  await fs.copyFile(input.sourcePath, target);

  const stored = await loadStoredMetadata();
  const hashIndex = new Map<string, string>(Object.values(stored).flatMap((item) => item.hash && item.id ? [[item.hash, item.id]] : []));
  const source = SCAN_SOURCES.find((item) => item.id === "hub-imports")!;
  const record = await buildRecord(source, target, stored, hashIndex, {
    tagInput: { tag: "work", job: input.jobName, label: input.label || input.jobId },
    sourceLabel: source.label,
  });
  if (!record) return null;
  record.status = "READY";
  record.job = input.jobName?.trim() || input.jobId?.trim() || record.job;
  record.tags = Array.from(new Set(["work", input.jobName?.trim(), input.label?.trim()].filter(Boolean).map((tag) => String(tag).toLowerCase())));
  record.needsTagging = false;
  await persistLibraryItems([...(await getLibrary()).filter((item) => item.id !== record.id), record].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), stored);
  return await getMediaById(record.id);
}

export function getContentType(ext: string) {
  if (IMAGE_EXTENSIONS.has(ext)) return ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
  if (VIDEO_EXTENSIONS.has(ext)) return ext === ".mov" ? "video/quicktime" : "video/mp4";
  if (AUDIO_EXTENSIONS.has(ext)) return ext === ".wav" ? "audio/wav" : ext === ".m4a" || ext === ".aac" ? "audio/mp4" : "audio/mpeg";
  return "application/octet-stream";
}

export { GALLERY_INBOX_DIR, HUB_UPLOADS_DIR, JOBS_FILE, LIBRARY_FILE, LIGHTROOM_DIR, SCAN_SOURCES };
