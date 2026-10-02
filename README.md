# Library Assistant

A ChatGPT-style assistant that answers **only** from a curated set of PDFs. Only the administrator can add or remove documents. Every answer cites the document and page it came from, and when the library doesn't cover a question the assistant says so.

Everything runs on free tiers or open-source models:

| Piece | What |
| --- | --- |
| App | Next.js 16 (App Router), Tailwind |
| Database, auth, file storage | Supabase (Postgres + pgvector, Storage) |
| Embeddings | `bge-m3` (multilingual) on Cloudflare Workers AI's free daily allowance, through the OpenAI-compatible API |
| OCR for scanned PDFs | Tesseract (tesseract.js), run locally, English + Arabic |
| LLM | Groq free tier (open-weight gpt-oss-120b) through the OpenAI-compatible API, so any compatible endpoint can be swapped in |

## How it works

1. **Ingest:** a PDF is parsed into pages and split into heading-aware passages of about 1,200 characters with overlap. Each passage gets a local embedding and is stored in `chunks`.
2. **Ask:** a follow-up question is rewritten into a standalone query. Hybrid search (vector similarity + full-text, merged with reciprocal rank fusion) runs in `match_chunks`.
3. **Ground:** passages below `RAG_MIN_SIMILARITY` are dropped. The LLM sees only the numbered passages and must cite them as `[n]`. With no passages, it says the library doesn't cover the question.
4. **Cite:** each `[n]` links to the source PDF, opened at the cited page.

## Setup

1. Fill in `.env.local` (copy it from `.env.example` if it's missing):
   - `SUPABASE_SECRET_KEY`: Supabase dashboard → Project Settings → API Keys → secret key.
   - `LLM_API_KEY`: a free key from https://console.groq.com/keys.
   - `EMBEDDING_BASE_URL` and `EMBEDDING_API_KEY`: in the Cloudflare dashboard (free account, no card), open **AI → Workers AI → Use REST API**. Copy the account ID into the URL and create a token with Workers AI permission.
   - `ADMIN_EMAILS`: your email. `ALLOWED_EMAILS`: anyone else you invite, or `*` to let anyone sign up.
2. Install and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open http://localhost:3000, choose **Invited? Create an account** and sign up with an admin email.
4. Go to **Manage library** and upload PDFs, or bulk-load a folder:
   ```bash
   npm run ingest -- ./pdfs --collection general
   ```

The database schema is in `supabase/migrations/`. Apply each file in order in the Supabase SQL editor. `0001_init.sql` is already applied to the `muslimChat` project. After applying `0002_bge_m3_embeddings.sql`, run `npm run reembed` to embed the existing chunks.

## Deploying (Vercel)

The app runs on Vercel's free Hobby plan (no card needed). Embeddings and the LLM are API calls, so the server stays small.

1. Push the repo to GitHub.
2. On vercel.com, choose **Add New → Project**, import the repo, and keep the detected Next.js settings.
3. Before the first deploy, open **Environment Variables** and add every value from `.env.local`.
4. Deploy. The app is served at `https://<project>.vercel.app`, and every push to the production branch redeploys it.
5. In Supabase, open **Authentication → URL Configuration** and set **Site URL** to the Vercel URL.

On Vercel, an upload from the admin page must finish indexing within 300 seconds. That is plenty for text PDFs, but OCR takes about 5–20 s per page, so add large scanned PDFs from your own machine with `npm run ingest`. It writes to the same Supabase project.

## Switching the embedding model

Set the `EMBEDDING_*` variables to another OpenAI-compatible endpoint. If the vector size changes, add a migration that changes `chunks.embedding` and `match_chunks` to the new size (see `supabase/migrations/0002_bge_m3_embeddings.sql`), then run `npm run reembed` to re-embed every chunk from its stored text. Re-tune `RAG_MIN_SIMILARITY` afterwards, because each model has its own similarity scale.

## Checking answer quality

Edit `eval/questions.json`:
- **In-scope questions:** give each one the expected document title (or part of it) and, optionally, a page.
- **Out-of-scope questions:** leave out `expect`.

Then run:

```bash
npm run eval -- --retrieval-only   # fast, no LLM calls
npm run eval                        # also checks citations and refusals
```

The output shows the top similarity scores for in-scope and out-of-scope questions. Set `RAG_MIN_SIMILARITY` to a value between the two groups.

## Switching the LLM

Change only the `LLM_*` variables. Examples:
- **Ollama (fully local):** `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama`, `LLM_MODEL=qwen2.5:3b`
- **OpenRouter:** `LLM_BASE_URL=https://openrouter.ai/api/v1` with a `:free` model.

## Known limits

- Scanned pages are read with OCR (Tesseract, run locally; about 5–20 s per page on a CPU). `OCR_LANGS` sets the languages, `eng+ara` by default. For a book that's only in Arabic, `OCR_LANGS=ara` avoids Arabic words being misread as Latin letters. OCR text is never perfect, so check answers against the cited page.
- Indexing runs inside the upload request. A large PDF can take a few minutes, so keep the admin tab open until it finishes.
- Cloudflare's free allowance (10,000 neurons a day, roughly 9 million tokens with `bge-m3`) resets at 00:00 UTC.
- Groq's free tier is rate-limited (tokens per minute). Heavy concurrent use returns a "please wait" message.
