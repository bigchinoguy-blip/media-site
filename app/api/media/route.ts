import { NextResponse } from "next/server";
import { getLibrarySummary } from "../../../lib/media";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getLibrarySummary();
  return NextResponse.json(payload);
}
