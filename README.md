---
title: Library Assistant
emoji: 📚
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Library Assistant

A ChatGPT-style assistant that answers **only** from a curated set of PDFs. Only the administrator can add or remove documents. Every answer cites the document and page it came from, and when the library doesn't cover a question the assistant says so.

Everything runs on free tiers or open-source models:

| Piece | What |
| --- | --- |
| App | Next.js 16 (App Router), Tailwind |
| Database, auth, file storage | Supabase (Postgres + pgvector, Storage) |
| Embeddings | `multilingual-e5-small`, run locally on the CPU (no key) |
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

## Deploying (Hugging Face Spaces)

The `Dockerfile` builds a production image that listens on port 7860. The block at the top of this README configures the Space (`sdk: docker`, `app_port: 7860`).

1. On huggingface.co, choose **New Space**, pick the **Docker** SDK with the blank template, and make it public. A private Space can only be opened by people signed in to Hugging Face.
2. In the Space, open **Settings → Variables and secrets** and add every value from `.env.local`:
   - **Variables:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. They must be Variables, because Next.js needs them at build time and Spaces passes only Variables to the build. Add the rest (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_FAST_MODEL`, `LLM_REASONING_EFFORT`, `EMBEDDING_MODEL`, `OCR_LANGS`, `RAG_TOP_K`, `RAG_MIN_SIMILARITY`, `ADMIN_EMAILS`, `ALLOWED_EMAILS`) as Variables too.
   - **Secrets:** `SUPABASE_SECRET_KEY` and `LLM_API_KEY`.
3. Push the code. When git asks for a password, use a Hugging Face access token with write permission (Settings → Access Tokens):
   ```bash
   git remote add space https://huggingface.co/spaces/<user>/<space>
   git push space HEAD:main
   ```
   The Space builds the image (the embedding model is downloaded into it during the build) and serves the app at `https://<user>-<space>.hf.space`.
4. In Supabase, open **Authentication → URL Configuration** and set **Site URL** to the Space URL.

Free Spaces sleep after 48 hours without visitors, and the first request after that takes a minute while the Space wakes up. OCR on the free 2-vCPU machine is slow, so you can keep loading large or scanned PDFs from your own machine with `npm run ingest`. It writes to the same Supabase project.

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
- Indexing runs inside the request on the server CPU. A large PDF can take a few minutes, so keep the admin tab open until it finishes.
- Groq's free tier is rate-limited (tokens per minute). Heavy concurrent use returns a "please wait" message.
