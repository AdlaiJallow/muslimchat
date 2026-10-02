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

export const answerModel = () => process.env.LLM_MODEL || "llama-3.3-70b-versatile";
export const fastModel = () => process.env.LLM_FAST_MODEL || "llama-3.1-8b-instant";
