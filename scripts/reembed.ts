/**
 * Fills in embeddings for chunks that don't have one, from the stored chunk text. Run it
 * after switching embedding models (see migration 0002) instead of re-parsing every PDF.
 *
 *   npm run reembed
 */
import { config } from "dotenv";
import { embedPassages, passageText } from "@/lib/rag/embed";
import { createAdminClient } from "@/lib/supabase/admin";

config({ path: ".env.local" });

const BATCH = 32;

async function main() {
  const db = createAdminClient();
  let done = 0;
  for (;;) {
    const { data, error } = await db
      .from("chunks")
      .select("id, heading, content")
      .is("embedding", null)
      .order("id")
      .limit(BATCH);
    if (error) throw new Error(`Reading chunks failed: ${error.message}`);
    if (data.length === 0) break;

    const embeddings = await embedPassages(data.map((c) => passageText(c.heading, c.content)));
    for (const [i, chunk] of data.entries()) {
      const { error: updError } = await db
        .from("chunks")
        .update({ embedding: JSON.stringify(embeddings[i]) })
        .eq("id", chunk.id);
      if (updError) throw new Error(`Updating chunk ${chunk.id} failed: ${updError.message}`);
    }
    done += data.length;
    console.log(`Embedded ${done} chunks`);
  }
  console.log(done === 0 ? "Every chunk already has an embedding." : "Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
