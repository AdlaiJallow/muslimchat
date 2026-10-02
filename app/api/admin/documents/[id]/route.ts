import { getAdmin } from "@/lib/auth";
import { createAdminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Rename a document or move it to another collection. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/documents/[id]">) {
  if (!(await getAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as { title?: string; collection?: string };
  const fields: Record<string, string> = {};
  if (body.title?.trim()) fields.title = body.title.trim();
  if (body.collection?.trim()) fields.collection = body.collection.trim();
  if (Object.keys(fields).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("documents")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/** Removes the stored PDF and the document row (chunks cascade). */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admin/documents/[id]">) {
  if (!(await getAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const db = createAdminClient();

  const { data: doc } = await db.from("documents").select("storage_path").eq("id", id).maybeSingle();
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  await db.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  const { error } = await db.from("documents").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
