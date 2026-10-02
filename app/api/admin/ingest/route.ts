import { getAdmin } from "@/lib/auth";
import { ingestDocument } from "@/lib/rag/ingest";

export const runtime = "nodejs";
// Embedding runs on the server CPU; large PDFs can take minutes.
export const maxDuration = 800;

/** (Re)indexes a stored document. Also used for "re-index" in the admin page. */
export async function POST(request: Request) {
  if (!(await getAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return Response.json({ error: "id is required" }, { status: 400 });

  try {
    const result = await ingestDocument(body.id);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}
