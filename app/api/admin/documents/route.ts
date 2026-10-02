import { getAdmin } from "@/lib/auth";
import { createAdminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from("documents")
    .select("id, title, filename, collection, status, page_count, chunk_count, error, version, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ documents: data });
}

/**
 * Registers a document and returns a signed upload URL. The browser uploads the PDF
 * straight to Supabase Storage (no size limits from this server), then calls /api/admin/ingest.
 */
export async function POST(request: Request) {
  if (!(await getAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    filename?: string;
    title?: string;
    collection?: string;
  } | null;
  const filename = body?.filename?.trim();
  if (!filename || !/\.pdf$/i.test(filename)) {
    return Response.json({ error: "A .pdf filename is required" }, { status: 400 });
  }

  const db = createAdminClient();
  const id = crypto.randomUUID();
  const storagePath = `${id}/${filename.replace(/[^\w.\-]+/g, "_")}`;
  const title = body?.title?.trim() || filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
  const collection = body?.collection?.trim() || "general";

  const { data: upload, error: urlError } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (urlError || !upload) {
    return Response.json({ error: urlError?.message ?? "Could not create upload URL" }, { status: 500 });
  }

  const { error } = await db
    .from("documents")
    .insert({ id, title, filename, storage_path: storagePath, collection });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ id, path: upload.path, token: upload.token });
}
