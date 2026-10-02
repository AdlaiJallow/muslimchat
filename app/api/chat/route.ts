import { answerParams, citedNumbers, prepareAnswer } from "@/lib/rag/answer";
import { answerModel, getLlm, normalizeCitations } from "@/lib/rag/llm";
import type { HistoryMessage } from "@/lib/rag/prompt";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Streams newline-delimited JSON events:
 *   {type:"meta", conversationId, citations}  then  {type:"delta", text}*  then  {type:"done"} | {type:"error", message}
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    conversationId?: string;
    message?: string;
  } | null;
  const message = body?.message?.trim();
  if (!message) return Response.json({ error: "Message is required" }, { status: 400 });
  if (message.length > 4000) return Response.json({ error: "Message is too long" }, { status: 400 });

  // RLS scopes every query below to the signed-in user's own conversations.
  let conversationId = body?.conversationId;
  let history: HistoryMessage[] = [];
  if (conversationId) {
    const { data: convo } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!convo) return Response.json({ error: "Conversation not found" }, { status: 404 });
    const { data: rows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: false })
      .limit(10);
    history = (rows ?? []).reverse() as HistoryMessage[];
  } else {
    const { data: convo, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select("id")
      .single();
    if (error || !convo) return Response.json({ error: "Could not start conversation" }, { status: 500 });
    conversationId = convo.id as string;
  }

  await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let answer = "";
      try {
        const prepared = await prepareAnswer(history, message);
        send({ type: "meta", conversationId, citations: prepared.citations });

        const completion = await getLlm().chat.completions.create({
          model: answerModel(),
          messages: prepared.messages,
          stream: true,
          ...answerParams(),
        });
        for await (const part of completion) {
          const raw = part.choices[0]?.delta?.content;
          if (raw) {
            const text = normalizeCitations(raw);
            answer += text;
            send({ type: "delta", text });
          }
        }

        const used = new Set(citedNumbers(answer));
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: answer,
          citations: prepared.citations.filter((c) => used.has(c.n)),
        });
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        send({ type: "done" });
      } catch (err) {
        console.error("chat error", err);
        const status = (err as { status?: number }).status;
        send({
          type: "error",
          conversationId,
          message:
            status === 429
              ? "The free LLM tier is rate-limited right now. Please wait a minute and try again."
              : "Something went wrong while answering. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
