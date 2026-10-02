import { answerModel, fastModel, getLlm, normalizeCitations, reasoningParams } from "@/lib/rag/llm";
import {
  buildAnswerMessages,
  buildRewriteMessages,
  toCitations,
  type HistoryMessage,
} from "@/lib/rag/prompt";
import { retrieve } from "@/lib/rag/retrieve";

/** Turns a follow-up ("what about the second one?") into a standalone search query. */
export async function standaloneQuery(history: HistoryMessage[], question: string) {
  if (history.length === 0) return question;
  try {
    const res = await getLlm().chat.completions.create({
      model: fastModel(),
      messages: buildRewriteMessages(history, question),
      temperature: 0,
      max_tokens: 400, // includes reasoning tokens on reasoning models
      ...reasoningParams(),
    });
    return res.choices[0]?.message?.content?.trim() || question;
  } catch {
    return question;
  }
}

/** Retrieval + prompt assembly shared by the chat route (streaming) and the eval script. */
export async function prepareAnswer(history: HistoryMessage[], question: string) {
  const query = await standaloneQuery(history, question);
  const { chunks, all } = await retrieve(query);
  return {
    query,
    chunks,
    all,
    citations: toCitations(chunks),
    messages: buildAnswerMessages(history, question, chunks),
  };
}

export const answerParams = () => ({ temperature: 0.2, max_tokens: 3000, ...reasoningParams() });

export async function answerOnce(history: HistoryMessage[], question: string) {
  const prepared = await prepareAnswer(history, question);
  const res = await getLlm().chat.completions.create({
    model: answerModel(),
    messages: prepared.messages,
    ...answerParams(),
  });
  return { ...prepared, answer: normalizeCitations(res.choices[0]?.message?.content ?? "") };
}

/** Citation numbers actually used in an answer, e.g. "[1][3]" → [1, 3]. */
export function citedNumbers(answer: string): number[] {
  return [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
}
