# Library Assistant

A ChatGPT-style assistant that answers **only** from a curated set of PDFs. Only the administrator can add or remove documents. Every answer cites the document and page it came from, and when the library doesn't cover a question the assistant says so.

Everything runs on free tiers or open-source models:

| Piece | What |
| --- | --- |
| App | Next.js 16 (App Router), Tailwind |
| Database, auth, file storage | Supabase (Postgres + pgvector, Storage) |
| Embeddings | `multilingual-e5-small`, run locally on the CPU (no key) |
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
   - `ADMIN_EMAILS`: your email. `ALLOWED_EMAILS`: anyone else you invite.
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
   The first run downloads the embedding model (about 130 MB) into `.cache/models`.

The database schema is in `supabase/migrations/0001_init.sql` and has already been applied to the `muslimChat` Supabase project.

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

- Scanned (image-only) PDFs have no extractable text and fail with a clear error. OCR isn't implemented yet.
- Indexing runs inside the request on the server CPU. A large PDF can take a few minutes, so keep the admin tab open until it finishes.
- Groq's free tier is rate-limited (tokens per minute). Heavy concurrent use returns a "please wait" message.
