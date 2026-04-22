import { NextResponse } from "next/server";
import { saveUpload } from "../../../../lib/media";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const tagValue = form.get("tag");
  const jobValue = form.get("job");
  const item = await saveUpload(file.name, await file.arrayBuffer(), {
    tag: typeof tagValue === "string" ? (tagValue as "work" | "personal" | "travel" | "social" | "skip") : undefined,
    job: typeof jobValue === "string" ? jobValue : undefined,
  });

  return NextResponse.json({ item });
}
