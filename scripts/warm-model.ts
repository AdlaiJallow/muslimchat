/**
 * Downloads the embedding model into .cache/models so the first query doesn't wait for it.
 * Runs during the Docker build: npx tsx scripts/warm-model.ts
 */
import { embedQuery } from "@/lib/rag/embed";

async function main() {
  const vector = await embedQuery("warm up");
  console.log(`Embedding model ready (${vector.length} dimensions).`);
  // onnxruntime keeps native threads alive; exit explicitly so the build step finishes.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
