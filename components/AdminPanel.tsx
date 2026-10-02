"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export interface DocumentRow {
  id: string;
  title: string;
  filename: string;
  collection: string;
  status: "pending" | "processing" | "ready" | "error";
  page_count: number | null;
  chunk_count: number;
  error: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<DocumentRow["status"], string> = {
  pending: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  processing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function AdminPanel({ initialDocuments }: { initialDocuments: DocumentRow[] }) {
  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments);
  const [collection, setCollection] = useState("general");
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { documents } = await api<{ documents: DocumentRow[] }>("/api/admin/documents");
      setDocuments(documents);
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }, []);

  // Poll while anything is being indexed.
  const busy = documents.some((d) => d.status === "processing" || d.status === "pending");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  const ingest = (id: string) =>
    api<{ chunks: number; pages: number }>("/api/admin/ingest", {
      method: "POST",
      body: JSON.stringify({ id }),
    });

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    const files = Array.from(fileInput.current?.files ?? []);
    if (files.length === 0) return;
    setMessage(null);
    const supabase = createClient();

    const ids: string[] = [];
    try {
      for (const file of files) {
        setUploading(`Uploading ${file.name}…`);
        const { id, path, token } = await api<{ id: string; path: string; token: string }>(
          "/api/admin/documents",
          { method: "POST", body: JSON.stringify({ filename: file.name, collection }) },
        );
        const { error } = await supabase.storage
          .from("documents")
          .uploadToSignedUrl(path, token, file, { contentType: "application/pdf" });
        if (error) throw new Error(`${file.name}: ${error.message}`);
        ids.push(id);
      }
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
    await load();

    // Index one at a time: embedding is CPU-bound on the server.
    for (const id of ids) {
      try {
        const r = await ingest(id);
        setMessage({ kind: "ok", text: `Indexed ${r.pages} pages into ${r.chunks} passages.` });
      } catch (err) {
        setMessage({ kind: "error", text: (err as Error).message });
      }
      await load();
    }
  }

  async function reindex(doc: DocumentRow) {
    setMessage(null);
    setDocuments((ds) => ds.map((d) => (d.id === doc.id ? { ...d, status: "processing" } : d)));
    try {
      const r = await ingest(doc.id);
      setMessage({ kind: "ok", text: `Re-indexed “${doc.title}”: ${r.chunks} passages.` });
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
    await load();
  }

  async function remove(doc: DocumentRow) {
    if (!confirm(`Delete “${doc.title}” from the library? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/documents/${doc.id}`, { method: "DELETE" });
      setDocuments((ds) => ds.filter((d) => d.id !== doc.id));
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  async function edit(doc: DocumentRow, field: "title" | "collection") {
    const value = prompt(field === "title" ? "Title" : "Collection", doc[field]);
    if (!value || value === doc[field]) return;
    try {
      await api(`/api/admin/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: (err as Error).message });
    }
  }

  const collections = [...new Set(documents.map((d) => d.collection))];

  return (
    <div className="mt-8 space-y-6">
      <form
        onSubmit={onUpload}
        className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm">
          <span className="text-[var(--muted)]">PDF files</span>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            required
            className="mt-1 block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-[var(--border)] file:px-3 file:py-1.5"
          />
        </label>
        <label className="text-sm sm:w-48">
          <span className="text-[var(--muted)]">Collection</span>
          <input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            list="collections"
            className="input mt-1"
          />
          <datalist id="collections">
            {collections.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <button type="submit" disabled={!!uploading} className="btn-primary">
          {uploading ?? "Upload & index"}
        </button>
      </form>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-start text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 py-2.5 text-start font-medium">Document</th>
              <th className="px-4 py-2.5 text-start font-medium">Collection</th>
              <th className="px-4 py-2.5 text-start font-medium">Status</th>
              <th className="px-4 py-2.5 text-end font-medium">Pages</th>
              <th className="px-4 py-2.5 text-end font-medium">Passages</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No documents yet. Upload PDFs above to build the library.
                </td>
              </tr>
            ) : (
              documents.map((d) => (
                <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-2.5">
                    <button onClick={() => edit(d, "title")} className="text-start font-medium hover:underline">
                      {d.title}
                    </button>
                    <div className="text-xs text-[var(--muted)]">{d.filename}</div>
                    {d.error && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{d.error}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => edit(d, "collection")} className="hover:underline">
                      {d.collection}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{d.page_count ?? "—"}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{d.chunk_count || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-end">
                    <button onClick={() => reindex(d)} disabled={d.status === "processing"} className="btn-ghost">
                      Re-index
                    </button>
                    <button onClick={() => remove(d)} className="btn-ghost hover:!text-red-600">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
