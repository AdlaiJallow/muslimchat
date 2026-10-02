/**
 * Matches a citation marker: "[2]", plus variants some models emit such as "[2†p.3-8]"
 * or "[2†L5-L9]". Group 1 is the source number. Not followed by "(" so Markdown links
 * like "[2](url)" are left alone.
 */
export const CITATION_PATTERN = /\[(\d+)(?:†[^\]\n]*)?\](?!\()/g;

/** Source numbers cited in a text, e.g. "[1][3†p.2]" → [1, 3]. */
export function citedNumbers(text: string): number[] {
  return [...new Set([...text.matchAll(CITATION_PATTERN)].map((m) => Number(m[1])))];
}
