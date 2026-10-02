import OpenAI from "openai";

/**
 * Embedding dimension of the configured model; must match vector(n) in the schema.
 * bge-m3 returns 1024.
 */
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 1024);

let client: OpenAI | undefined;

/**
 * Client for any OpenAI-compatible embeddings endpoint. Defaults target Cloudflare Workers AI
 * (free daily allowance), whose base URL includes the account ID.
 */
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.EMBEDDING_API_KEY;
    const baseURL = process.env.EMBEDDING_BASE_URL;
    if (!apiKey || apiKey.endsWith("...") || !baseURL || baseURL.includes("<")) {
      throw new Error("EMBEDDING_BASE_URL and EMBEDDING_API_KEY must be set");
    }
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

async function embed(texts: string[]): Promise<number[][]> {
  const response = await getClient().embeddings.create({
    model: process.env.EMBEDDING_MODEL || "@cf/baai/bge-m3",
    input: texts,
  });
  const vectors = response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (vectors[0]?.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding model returned ${vectors[0]?.length} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  return vectors;
}

export async function embedPassages(texts: string[], batchSize = 32): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    vectors.push(...(await embed(texts.slice(i, i + batchSize))));
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}

/** Prefix the section heading so passages deep inside a section keep their context. */
export function passageText(heading: string | null, content: string): string {
  return heading && !content.startsWith(heading) ? `${heading}\n${content}` : content;
}
