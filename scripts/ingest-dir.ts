/**
 * Bulk-loads every PDF in a folder into the knowledge base.
 *
 *   npm run ingest -- ./pdfs [--collection name]
 *
 * Files already in the library (same filename + collection) are skipped unless --force.
 */
import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ingestDocument } from "@/lib/rag/ingest";
import { createAdminClient, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const collectionIdx = args.indexOf("--collection");
  const collection = collectionIdx >= 0 ? args[collectionIdx + 1] : "general";
  const force = args.includes("--force");
  if (!dir) {
    console.error("Usage: npm run ingest -- <folder> [--collection name] [--force]");
    process.exit(1);
  }

  const db = createAdminClient();
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  console.log(`Found ${files.length} PDF(s) in ${dir}`);

  for (const filename of files) {
    const { data: existing } = await db
      .from("documents")
      .select("id, status")
      .eq("filename", filename)
      .eq("collection", collection)
      .maybeSingle();
    if (existing && existing.status === "ready" && !force) {
      console.log(`- ${filename}: already indexed, skipping`);
      continue;
    }

    let id = existing?.id as string | undefined;
    if (!id) {
      id = crypto.randomUUID();
      const storagePath = `${id}/${filename.replace(/[^\w.\-]+/g, "_")}`;
      const bytes = await readFile(path.join(dir, filename));
      const { error: upError } = await db.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storagePath, bytes, { contentType: "application/pdf" });
      if (upError) {
        console.error(`✗ ${filename}: upload failed: ${upError.message}`);
        continue;
      }
      const title = filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
      const { error } = await db
        .from("documents")
        .insert({ id, title, filename, storage_path: storagePath, collection });
      if (error) {
        console.error(`✗ ${filename}: ${error.message}`);
        continue;
      }
    }

    const started = Date.now();
    try {
      const r = await ingestDocument(id);
      const ocr = r.ocrPages ? `, ${r.ocrPages} via OCR` : "";
      console.log(`✓ ${filename}: ${r.pages} pages${ocr} → ${r.chunks} passages (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (err) {
      console.error(`✗ ${filename}: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
