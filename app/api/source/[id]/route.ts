import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Opens a cited PDF at the cited page via a short-lived signed URL. */
export async function GET(request: Request, ctx: RouteContext<"/api/source/[id]">) {
  if (!(await getUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const page = Number(new URL(request.url).searchParams.get("page")) || 1;

  const db = createAdminClient();
  const { data: doc } = await db
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .eq("status", "ready")
    .maybeSingle();
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, 60 * 10);
  if (error || !data) return Response.json({ error: "Could not open document" }, { status: 500 });

  return NextResponse.redirect(`${data.signedUrl}#page=${page}`);
}
