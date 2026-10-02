/**
 * Splits page texts into overlapping, heading-aware chunks that keep page ranges.
 *
 * Sizes are in characters. The embedding model (multilingual-e5-small) reads at most
 * 512 tokens, so chunks stay around 1,200 characters (~300 English tokens; Arabic
 * tokenizes denser) to leave headroom.
 */

export interface Chunk {
  index: number;
  content: string;
  heading: string | null;
  pageStart: number;
  pageEnd: number;
  tokenCount: number;
}

export interface ChunkOptions {
  targetChars?: number;
  maxChars?: number;
  overlapChars?: number;
  /** A new heading closes the current chunk only if it is at least this long. */
  minCharsBeforeHeadingBreak?: number;
}

interface Unit {
  text: string;
  page: number;
}

const SENTENCE_END = /(?<=[.!?؟。])\s+/u;

/**
 * Heuristic for PDF text (which has no markup): short lines without trailing
 * punctuation that are numbered sections ("2.1 Scope", "Chapter 3"), ALL CAPS, or
 * Title Case. Plain numbered list items ("3. Embed the query") are not headings.
 */
function isHeading(line: string): boolean {
  if (line.length < 3 || line.length > 80) return false;
  if (/[.,;:،؛!?؟)]$/u.test(line) || /^[•\-–*·▪●◦]/u.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > 10) return false;
  if (/^(\d+\.\d+(\.\d+)*|chapter|section|part)\s+\S/i.test(line)) return true;
  const letters = line.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)) {
    return true;
  }
  const alphaWords = words.filter((w) => /^\p{L}/u.test(w));
  if (alphaWords.length < 2 || alphaWords.length > 8) return false;
  const minor = /^(a|an|the|and|or|of|in|on|for|to|by|with|at|from|vs)$/i;
  return alphaWords.every((w) => /^\p{Lu}/u.test(w) || minor.test(w));
}

function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + word.length + 1 > maxChars) {
      parts.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkPages(pages: string[], options: ChunkOptions = {}): Chunk[] {
  const {
    targetChars = 1200,
    maxChars = 1600,
    overlapChars = 200,
    minCharsBeforeHeadingBreak = 400,
  } = options;

  const chunks: Chunk[] = [];
  let buffer: Unit[] = [];
  let bufferHeading: string | null = null;
  let currentHeading: string | null = null;

  const bufferLength = () => buffer.reduce((n, u) => n + u.text.length + 1, 0);

  const flush = (keepOverlap: boolean) => {
    if (buffer.length === 0) return;
    const content = buffer.map((u) => u.text).join(" ").trim();
    if (content) {
      chunks.push({
        index: chunks.length,
        content,
        heading: bufferHeading,
        pageStart: buffer[0].page,
        pageEnd: buffer[buffer.length - 1].page,
        tokenCount: estimateTokens(content),
      });
    }
    let carried: Unit[] = [];
    if (keepOverlap) {
      let size = 0;
      for (let i = buffer.length - 1; i > 0; i--) {
        size += buffer[i].text.length;
        if (size > overlapChars) break;
        carried = [buffer[i], ...carried];
      }
    }
    buffer = carried;
    bufferHeading = currentHeading;
  };

  const addUnit = (unit: Unit) => {
    if (buffer.length === 0) bufferHeading = currentHeading;
    if (bufferLength() + unit.text.length > maxChars) flush(true);
    buffer.push(unit);
    if (bufferLength() >= targetChars) flush(true);
  };

  const addParagraph = (paragraph: string, page: number) => {
    const text = paragraph
      .replace(/(\p{L})-\s+(\p{Ll})/gu, "$1$2") // re-join hyphenated line breaks
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    for (const sentence of text.split(SENTENCE_END)) {
      for (const piece of splitLong(sentence, maxChars - overlapChars)) {
        addUnit({ text: piece, page });
      }
    }
  };

  pages.forEach((pageText, i) => {
    const page = i + 1;
    let paragraph = "";
    for (const rawLine of pageText.split(/\n/)) {
      const line = rawLine.trim();
      if (!line) {
        addParagraph(paragraph, page);
        paragraph = "";
      } else if (isHeading(line)) {
        addParagraph(paragraph, page);
        paragraph = "";
        if (bufferLength() >= minCharsBeforeHeadingBreak) flush(false);
        currentHeading = line;
        if (buffer.length === 0) bufferHeading = currentHeading;
        addUnit({ text: line, page });
      } else {
        paragraph += `${line}\n`;
      }
    }
    addParagraph(paragraph, page);
  });
  flush(false);

  return chunks;
}
