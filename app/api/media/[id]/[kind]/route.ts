import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getContentType, getMediaById } from "../../../../../lib/media";

export const dynamic = "force-dynamic";

function svgPlaceholder(kind: string) {
  const icon = kind === "music" ? "♫" : "▶";
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><circle cx="600" cy="450" r="130" fill="#334155"/><text x="600" y="495" text-anchor="middle" font-size="180" font-family="Arial, sans-serif" fill="#cbd5e1">${icon}</text></svg>`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await context.params;
  const item = await getMediaById(id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (kind === "thumb") {
    if (item.type === "photo") {
      const buffer = await fs.readFile(item.absolutePath);
      return new NextResponse(buffer, { headers: { "Content-Type": getContentType(item.extension), "Cache-Control": "public, max-age=3600" } });
    }
    if (item.type === "video" && item.thumb.startsWith("/generated-thumbs/")) {
      const buffer = await fs.readFile(`${process.cwd()}/public${item.thumb}`);
      return new NextResponse(buffer, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
    }
    return new NextResponse(svgPlaceholder(item.type), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
  }

  const buffer = await fs.readFile(item.absolutePath);
  return new NextResponse(buffer, { headers: { "Content-Type": getContentType(item.extension), "Cache-Control": "public, max-age=3600" } });
}
