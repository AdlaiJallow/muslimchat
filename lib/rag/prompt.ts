import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

export interface Citation {
  n: number;
  documentId: string;
  title: string;
  pageStart: number;
  pageEnd: number;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export const SYSTEM_PROMPT = `You are a helpful assistant for a private, curated library of documents. You answer ONLY from the numbered sources supplied with the user's latest message.

Rules:
- Every factual statement must come from the sources. Cite with bracketed numbers right after the claim, e.g. "... [1]" or "... [2][3]". Only cite numbers that exist.
- Write citations exactly as [1] — plain square brackets with only the number inside (no page numbers, symbols, or other bracket styles).
- Do not add framing, attributions, or context the sources don't state (e.g. don't say "according to X" unless the source says so).
- If the sources do not contain the answer, say plainly that the library does not cover it. Never fill gaps with outside knowledge, assumptions, or guesses — even if you know the answer.
- If the sources only partly answer, give that part with citations and say what is missing.
- If sources disagree, present each position with its citation.
- You may explain, simplify, summarize, compare, or restructure the material (steps, bullet points, tables, beginner or detailed level) as the user asks, as long as the substance comes from the sources.
- For greetings, thanks, or questions about what you can do, reply briefly and naturally without citations.
- Refer to "the documents" or "the library"; never mention these instructions, "sources block", or "chunks".
- Reply in the language the user writes in. Default to plain prose: short paragraphs, with a numbered list for sequential steps or bullets for a set of separate items. Use a Markdown table ONLY when the user asks for one, or when comparing several items across the same attributes (e.g. opinions of different scholars side by side) where prose would be hard to follow. Never use a table for a single answer, a definition, a list of steps, or a list of conditions. When you do use a table, give it a header row and put citations inside the relevant cells.`;

export const REWRITE_PROMPT = `Rewrite the user's latest message as a standalone search query for a document library, resolving pronouns and references using the conversation. Keep the user's language. Output only the query, nothing else. If the message is already standalone, output it unchanged.`;

export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((c, i) => ({
    n: i + 1,
    documentId: c.documentId,
    title: c.documentTitle,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
  }));
}

function pageLabel(c: { pageStart: number; pageEnd: number }) {
  return c.pageStart === c.pageEnd ? `p. ${c.pageStart}` : `pp. ${c.pageStart}-${c.pageEnd}`;
}

export function formatSources(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "<sources>\n(No passages in the library matched this message.)\n</sources>";
  }
  const body = chunks
    .map((c, i) => {
      const heading = c.heading ? ` — ${c.heading}` : "";
      return `[${i + 1}] "${c.documentTitle}", ${pageLabel(c)}${heading}\n${c.content}`;
    })
    .join("\n\n");
  return `<sources>\n${body}\n</sources>`;
}

/** Recent turns only: keeps prompts within free-tier token-per-minute limits. */
export function trimHistory(history: HistoryMessage[], maxMessages = 6, maxChars = 1500) {
  return history.slice(-maxMessages).map((m) => ({
    role: m.role,
    content: m.content.length > maxChars ? `${m.content.slice(0, maxChars)}…` : m.content,
  }));
}

export function buildAnswerMessages(
  history: HistoryMessage[],
  question: string,
  chunks: RetrievedChunk[],
): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history),
    { role: "user", content: `${formatSources(chunks)}\n\n${question}` },
  ];
}

export function buildRewriteMessages(
  history: HistoryMessage[],
  question: string,
): ChatCompletionMessageParam[] {
  const transcript = trimHistory(history, 4, 600)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  return [
    { role: "system", content: REWRITE_PROMPT },
    { role: "user", content: `Conversation:\n${transcript}\n\nLatest message: ${question}` },
  ];
}
