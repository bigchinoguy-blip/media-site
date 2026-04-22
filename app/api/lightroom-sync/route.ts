import { NextResponse } from "next/server";
import { getLibrarySummary, importLightroomExports } from "../../../lib/media";

export const dynamic = "force-dynamic";

export async function GET() {
  const sync = await importLightroomExports();
  const payload = await getLibrarySummary();
  return NextResponse.json({ ...payload, sync });
}

export async function POST() {
  const sync = await importLightroomExports();
  const payload = await getLibrarySummary();
  return NextResponse.json({ ...payload, sync });
}
