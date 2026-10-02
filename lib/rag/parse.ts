import { extractText, getDocumentProxy } from "unpdf";

export interface ParsedPdf {
  totalPages: number;
  /** Text of each page; index 0 is page 1. */
  pages: string[];
}

export async function parsePdf(data: ArrayBuffer | Uint8Array): Promise<ParsedPdf> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { totalPages, pages: text };
}
