import OpenAI from "openai";

let client: OpenAI | undefined;

/** Client for any OpenAI-compatible endpoint (Groq by default; Ollama, OpenRouter, Gemini work too). */
export function getLlm(): OpenAI {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey || apiKey.endsWith("...")) throw new Error("LLM_API_KEY is not set");
    client = new OpenAI({
      apiKey,
      baseURL: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
    });
  }
  return client;
}

export const answerModel = () => process.env.LLM_MODEL || "openai/gpt-oss-120b";
export const fastModel = () => process.env.LLM_FAST_MODEL || "openai/gpt-oss-20b";

/** Extra params for reasoning models; empty when LLM_REASONING_EFFORT is unset. */
export function reasoningParams(): { reasoning_effort?: "low" | "medium" | "high" } {
  const effort = process.env.LLM_REASONING_EFFORT;
  return effort === "low" || effort === "medium" || effort === "high" ? { reasoning_effort: effort } : {};
}

/** Some models (gpt-oss) cite as 【1】; normalize to [1]. Safe per streamed delta. */
export function normalizeCitations(text: string): string {
  return text.replace(/【/g, "[").replace(/】/g, "]");
}
