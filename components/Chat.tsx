"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CITATION_PATTERN, citedNumbers } from "@/lib/rag/citations";
import type { Citation } from "@/lib/rag/prompt";

export interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
}

type StreamEvent =
  | { type: "meta"; conversationId: string; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string; conversationId?: string };

const SUGGESTIONS = [
  "What are the steps of a complete wudu?",
  "What breaks wudu?",
  "When is ghusl required?",
  "When can I do tayammum instead of wudu?",
  "What are the categories of water for purification?",
];

function sourceHref(c: Citation) {
  return `/api/source/${c.documentId}?page=${c.pageStart}`;
}

function pageLabel(c: Citation) {
  return c.pageStart === c.pageEnd ? `p. ${c.pageStart}` : `pp. ${c.pageStart}–${c.pageEnd}`;
}

/** Turns "[2]" (or "[2†p.3]") markers into links to the cited PDF page. */
function linkCitations(text: string, citations: Citation[]) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  return text.replace(CITATION_PATTERN, (match, n) => {
    const c = byN.get(Number(n));
    return c ? `[${n}](${sourceHref(c)} "${c.title.replace(/"/g, "'")}, ${pageLabel(c)}")` : match;
  });
}

export function AssistantMessage({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const used = new Set(citedNumbers(message.content));
  const sources = message.citations.filter((c) => used.has(c.n));

  return (
    <div className="prose-answer text-[15px] leading-relaxed" dir="auto">
      {message.content ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Wide tables scroll sideways instead of stretching the chat column.
            table: ({ children }) => (
              <div className="table-wrap">
                <table>{children}</table>
              </div>
            ),
            a: ({ href, title, children }) =>
              href?.startsWith("/api/source/") ? (
                <a href={href} title={title} target="_blank" rel="noreferrer" className="cite">
                  {children}
                </a>
              ) : (
                <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">
                  {children}
                </a>
              ),
          }}
        >
          {linkCitations(message.content, message.citations)}
        </ReactMarkdown>
      ) : (
        streaming && <p className="animate-pulse text-[var(--muted)]">Searching the library…</p>
      )}
      {!streaming && sources.length > 0 && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Sources</p>
          <ol className="mt-1.5 space-y-1 !list-none !pl-0 text-sm">
            {sources.map((c) => (
              <li key={c.n}>
                <a href={sourceHref(c)} target="_blank" rel="noreferrer" className="hover:underline">
                  <span className="cite">{c.n}</span> {c.title}{" "}
                  <span className="text-[var(--muted)]">· {pageLabel(c)}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function Chat({
  conversationId: initialConversationId,
  initialMessages,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const updateLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setError(null);
    setInput("");
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: `u${Date.now()}`, role: "user", content: message, citations: [] },
      { id: `a${Date.now()}`, role: "assistant", content: "", citations: [] },
    ]);

    let newId = conversationId;
    let failed = false;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "meta") {
            newId = event.conversationId;
            const { citations } = event;
            updateLast((m) => ({ ...m, citations }));
          } else if (event.type === "delta") {
            updateLast((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "error") {
            newId = event.conversationId ?? newId;
            failed = true;
            setError(event.message);
          }
        }
      }
    } catch (err) {
      failed = true;
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStreaming(false);
    }

    if (failed) setMessages((prev) => (prev[prev.length - 1]?.content ? prev : prev.slice(0, -1)));
    if (newId && newId !== conversationId) {
      setConversationId(newId);
      window.history.replaceState(null, "", `/c/${newId}`);
    }
    router.refresh(); // update the sidebar's conversation list
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="mt-[15vh] text-center">
              <h1 className="text-2xl font-semibold">What would you like to know?</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Answers come only from the curated library, with sources you can open.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => (s.endsWith("…") ? setInput(s.slice(0, -1)) : send(s))}
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--panel)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div
                      dir="auto"
                      className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[var(--user-bubble)] px-4 py-2.5 text-[15px]"
                    >
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    streaming={streaming && i === messages.length - 1}
                  />
                ),
              )}
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            dir="auto"
            placeholder="Ask about the library…"
            className="input max-h-48 min-h-[42px] resize-none py-2.5 [field-sizing:content]"
          />
          <button type="submit" disabled={streaming || !input.trim()} className="btn-primary h-[42px]">
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
