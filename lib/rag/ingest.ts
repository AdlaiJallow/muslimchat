import { createAdminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { chunkPages } from "@/lib/rag/chunk";
import { embedPassages } from "@/lib/rag/embed";
import { parsePdf } from "@/lib/rag/parse";

const INSERT_BATCH = 100;

/**
 * Parses, chunks, and embeds one stored PDF, replacing any previous chunks.
 * Status moves pending → processing → ready | error.
 */
export async function ingestDocument(documentId: string): Promise<{ chunks: number; pages: number }> {
  const db = createAdminClient();
  const setStatus = (fields: Record<string, unknown>) =>
    db
      .from("documents")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", documentId);

  const { data: doc, error } = await db
    .from("documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .single();
  if (error || !doc) throw new Error(`Document ${documentId} not found`);

  await setStatus({ status: "processing", error: null });

  try {
    const { data: file, error: dlError } = await db.storage
      .from(DOCUMENTS_BUCKET)
      .download(doc.storage_path);
    if (dlError || !file) throw new Error(`Download failed: ${dlError?.message}`);

    const { totalPages, pages } = await parsePdf(await file.arrayBuffer());
    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      throw new Error("No extractable text — the PDF may be scanned images (OCR is not supported yet).");
    }

    // Prefix the section heading so passages deep inside a section keep their context.
    const embeddings = await embedPassages(
      chunks.map((c) =>
        c.heading && !c.content.startsWith(c.heading) ? `${c.heading}\n${c.content}` : c.content,
      ),
    );

    const { error: delError } = await db.from("chunks").delete().eq("document_id", documentId);
    if (delError) throw new Error(`Clearing old chunks failed: ${delError.message}`);

    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      chunk_index: c.index,
      content: c.content,
      page_start: c.pageStart,
      page_end: c.pageEnd,
      heading: c.heading,
      token_count: c.tokenCount,
      embedding: JSON.stringify(embeddings[i]),
    }));
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error: insError } = await db.from("chunks").insert(rows.slice(i, i + INSERT_BATCH));
      if (insError) throw new Error(`Inserting chunks failed: ${insError.message}`);
    }

    await setStatus({ status: "ready", page_count: totalPages, chunk_count: chunks.length });
    return { chunks: chunks.length, pages: totalPages };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus({ status: "error", error: message });
    throw err;
  }
}
