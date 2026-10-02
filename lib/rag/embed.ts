import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import path from "node:path";

/** Embedding dimension of multilingual-e5-small; must match vector(384) in the schema. */
export const EMBEDDING_DIMENSIONS = 384;

env.cacheDir = path.join(process.cwd(), ".cache", "models");

let extractor: Promise<FeatureExtractionPipeline> | undefined;

function getExtractor() {
  extractor ??= pipeline(
    "feature-extraction",
    process.env.EMBEDDING_MODEL || "Xenova/multilingual-e5-small",
    { dtype: "q8" },
  ) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

async function embed(texts: string[]): Promise<number[][]> {
  const model = await getExtractor();
  const output = await model(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

/** E5 models expect "passage: " / "query: " prefixes. */
export async function embedPassages(texts: string[], batchSize = 16): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => `passage: ${t}`);
    vectors.push(...(await embed(batch)));
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([`query: ${text}`]);
  return vector;
}
