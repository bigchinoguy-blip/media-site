import { NextResponse } from "next/server";
import { saveUpload } from "../../../../lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const item = await saveUpload(file.name, await file.arrayBuffer());
  return NextResponse.json({ item });
}
