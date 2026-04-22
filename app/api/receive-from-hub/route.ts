import { NextResponse } from "next/server";
import { receiveFromHub } from "../../../lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.sourcePath) {
    return NextResponse.json({ error: "Missing sourcePath" }, { status: 400 });
  }

  const item = await receiveFromHub(body);
  if (!item) {
    return NextResponse.json({ error: "Could not import file" }, { status: 400 });
  }

  return NextResponse.json({ item });
}
