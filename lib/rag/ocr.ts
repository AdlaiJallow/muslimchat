import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { renderPageAsImage } from "unpdf";

/** Pages with fewer non-space characters than this are treated as scanned images. */
const MIN_TEXT_CHARS = 25;

/**
 * Render width in pixels. Scans come in arbitrary page sizes, so a fixed width (~240 DPI
 * on a Letter/A4 page) gives Tesseract consistent glyph sizes where a fixed zoom does not.
 */
const RENDER_WIDTH = 2000;

export function needsOcr(pageText: string): boolean {
  return pageText.replace(/\s/g, "").length < MIN_TEXT_CHARS;
}

/**
 * OCRs the given 1-based page numbers with Tesseract (runs locally; language data is
 * downloaded once into .cache/tesseract). OCR_LANGS uses Tesseract codes, e.g. "eng+ara".
 */
export async function ocrPages(
  pdf: Uint8Array,
  pageNumbers: number[],
  onPage?: (done: number, total: number) => void,
): Promise<Map<number, string>> {
  const langs = (process.env.OCR_LANGS || "eng+ara").split("+");
  // Tesseract writes downloaded language data here but won't create the folder itself.
  const cachePath = path.join(process.cwd(), ".cache", "tesseract");
  await mkdir(cachePath, { recursive: true });
  const worker = await createWorker(langs, 1, { cachePath });
  const results = new Map<number, string>();
  try {
    for (const [i, pageNumber] of pageNumbers.entries()) {
      // pdf.js may detach the buffer it is given, so render from a copy each time.
      const png = await renderPageAsImage(pdf.slice(), pageNumber, {
        canvasImport: () => import("@napi-rs/canvas"),
        width: RENDER_WIDTH,
      });
      const { data } = await worker.recognize(Buffer.from(png));
      results.set(pageNumber, data.text);
      onPage?.(i + 1, pageNumbers.length);
    }
  } finally {
    await worker.terminate();
  }
  return results;
}
