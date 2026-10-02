import { createAdminClient } from "@/lib/supabase/admin";
import { embedQuery } from "@/lib/rag/embed";

export interface RetrievedChunk {
  id: number;
  documentId: string;
  documentTitle: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  heading: string | null;
  similarity: number;
  score: number;
}

interface MatchRow {
  id: number;
  document_id: string;
  document_title: string;
  content: string;
  page_start: number;
  page_end: number;
  heading: string | null;
  similarity: number;
  score: number;
}

export interface RetrieveOptions {
  topK?: number;
  minSimilarity?: number;
  collection?: string | null;
}

/**
 * Hybrid (vector + full-text) search. Chunks below the similarity floor are dropped so
 * an off-topic question yields no sources and the model says the library doesn't cover it.
 */
export async function retrieve(query: string, options: RetrieveOptions = {}) {
  const topK = options.topK ?? Number(process.env.RAG_TOP_K ?? 8);
  const minSimilarity = options.minSimilarity ?? Number(process.env.RAG_MIN_SIMILARITY ?? 0.45);

  const embedding = await embedQuery(query);
  const { data, error } = await createAdminClient().rpc("match_chunks", {
    query_embedding: JSON.stringify(embedding),
    query_text: query,
    match_count: topK,
    collection_filter: options.collection ?? null,
  });
  if (error) throw new Error(`match_chunks failed: ${error.message}`);

  const all: RetrievedChunk[] = (data as MatchRow[]).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    content: r.content,
    pageStart: r.page_start,
    pageEnd: r.page_end,
    heading: r.heading,
    similarity: r.similarity,
    score: r.score,
  }));

  return {
    chunks: all.filter((c) => c.similarity >= minSimilarity),
    /** Unfiltered results, useful for tuning the threshold in eval. */
    all,
  };
}
