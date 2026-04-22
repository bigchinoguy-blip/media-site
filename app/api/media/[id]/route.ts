import { NextResponse } from "next/server";
import { updateMediaRecord } from "../../../../lib/media";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const item = await updateMediaRecord(id, body || {});
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}
