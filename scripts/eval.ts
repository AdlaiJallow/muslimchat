/**
 * Grounding check against eval/questions.json.
 *
 *   npm run eval              # retrieval + answers (uses the LLM)
 *   npm run eval -- --retrieval-only
 *
 * In-scope questions should retrieve the expected document (and page, if given) and
 * produce a cited answer. Out-of-scope questions should produce no citations.
 */
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { answerOnce, citedNumbers } from "@/lib/rag/answer";
import { retrieve } from "@/lib/rag/retrieve";

config({ path: ".env.local" });

interface EvalCase {
  question: string;
  /** Omit for out-of-scope questions that must be refused. */
  expect?: { title: string; page?: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const retrievalOnly = process.argv.includes("--retrieval-only");
  const cases = JSON.parse(await readFile("eval/questions.json", "utf8")) as EvalCase[];

  let hits = 0, inScope = 0, cited = 0, refused = 0, outOfScope = 0;
  const topSims: { q: string; sim: number; inScope: boolean }[] = [];

  for (const c of cases) {
    const isInScope = !!c.expect;
    const { chunks, all } = await retrieve(c.question);
    topSims.push({ q: c.question, sim: all[0]?.similarity ?? 0, inScope: isInScope });

    let line = "";
    if (isInScope) {
      inScope++;
      const hit = chunks.some(
        (ch) =>
          ch.documentTitle.toLowerCase().includes(c.expect!.title.toLowerCase()) &&
          (c.expect!.page === undefined ||
            (ch.pageStart <= c.expect!.page && c.expect!.page <= ch.pageEnd)),
      );
      if (hit) hits++;
      line = `${hit ? "✓" : "✗"} retrieval`;
    } else {
      outOfScope++;
      line = `${chunks.length === 0 ? "✓" : "·"} ${chunks.length} sources`;
    }

    if (!retrievalOnly) {
      const { answer } = await answerOnce([], c.question);
      const hasCitations = citedNumbers(answer).length > 0;
      if (isInScope && hasCitations) cited++;
      if (!isInScope && !hasCitations) refused++;
      line += ` | ${isInScope ? (hasCitations ? "✓ cited" : "✗ uncited") : hasCitations ? "✗ answered" : "✓ refused"}`;
      await sleep(2500); // stay under free-tier rate limits
    }
    console.log(`${line} | ${c.question}`);
  }

  console.log("\n— Summary —");
  if (inScope) console.log(`Retrieval hit rate: ${hits}/${inScope}`);
  if (!retrievalOnly) {
    if (inScope) console.log(`In-scope answers with citations: ${cited}/${inScope}`);
    if (outOfScope) console.log(`Out-of-scope questions refused: ${refused}/${outOfScope}`);
  }

  // Threshold tuning aid: RAG_MIN_SIMILARITY should sit between these two groups.
  const fmt = (xs: number[]) => (xs.length ? `min ${Math.min(...xs).toFixed(3)} / max ${Math.max(...xs).toFixed(3)}` : "n/a");
  console.log(`Top similarity, in-scope:     ${fmt(topSims.filter((t) => t.inScope).map((t) => t.sim))}`);
  console.log(`Top similarity, out-of-scope: ${fmt(topSims.filter((t) => !t.inScope).map((t) => t.sim))}`);
  console.log(`Current RAG_MIN_SIMILARITY:   ${process.env.RAG_MIN_SIMILARITY ?? "0.76 (default)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
