-- Knowledge base + chat schema for the curated-document assistant.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Knowledge base (admin-managed; only reachable through the service role)
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  storage_path text not null unique,
  collection text not null default 'general',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'error')),
  page_count int,
  chunk_count int not null default 0,
  error text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  page_start int not null,
  page_end int not null,
  heading text,
  token_count int,
  embedding extensions.vector(384) not null,
  fts tsvector generated always as (to_tsvector('simple', coalesce(heading, '') || ' ' || content)) stored
);

create index chunks_document_id_idx on public.chunks (document_id);
create index chunks_embedding_idx on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index chunks_fts_idx on public.chunks using gin (fts);
create index documents_collection_idx on public.documents (collection);

-- RLS on with no policies: anon/authenticated get nothing, service role bypasses.
alter table public.documents enable row level security;
alter table public.chunks enable row level security;

-- ---------------------------------------------------------------------------
-- Chat history (owned by the signed-in user)
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations (user_id, updated_at desc);
create index messages_conversation_id_idx on public.messages (conversation_id, id);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "own conversations: select" on public.conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own conversations: insert" on public.conversations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own conversations: update" on public.conversations
  for update to authenticated using ((select auth.uid()) = user_id);
create policy "own conversations: delete" on public.conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own messages: select" on public.messages
  for select to authenticated using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "own messages: insert" on public.messages
  for insert to authenticated with check (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Hybrid search: vector similarity + full-text, merged with reciprocal rank fusion
-- ---------------------------------------------------------------------------

create or replace function public.match_chunks(
  query_embedding extensions.vector(384),
  query_text text,
  match_count int default 8,
  collection_filter text default null,
  rrf_k int default 60
)
returns table (
  id bigint,
  document_id uuid,
  document_title text,
  storage_path text,
  content text,
  page_start int,
  page_end int,
  heading text,
  similarity float,
  score float
)
language sql
stable
set search_path = ''
as $$
  with eligible as (
    select c.id, c.embedding, c.fts
    from public.chunks c
    join public.documents d on d.id = c.document_id
    where d.status = 'ready'
      and (collection_filter is null or d.collection = collection_filter)
  ),
  -- OR together the meaningful terms so natural-language questions still match.
  terms as (
    select to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) as q
    from unnest(tsvector_to_array(to_tsvector('simple', query_text))) as lexeme
    where char_length(lexeme) >= 3
  ),
  semantic as (
    select e.id,
           row_number() over (order by e.embedding operator(extensions.<=>) query_embedding) as rank
    from eligible e
    order by e.embedding operator(extensions.<=>) query_embedding
    limit match_count * 4
  ),
  keyword as (
    select e.id,
           row_number() over (order by ts_rank_cd(e.fts, t.q) desc) as rank
    from eligible e, terms t
    where t.q is not null and e.fts @@ t.q
    order by ts_rank_cd(e.fts, t.q) desc
    limit match_count * 4
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (rrf_k + s.rank), 0.0) + coalesce(1.0 / (rrf_k + k.rank), 0.0) as score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select c.id,
         c.document_id,
         d.title,
         d.storage_path,
         c.content,
         c.page_start,
         c.page_end,
         c.heading,
         1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity,
         f.score
  from fused f
  join public.chunks c on c.id = f.id
  join public.documents d on d.id = c.document_id
  order by f.score desc
  limit match_count;
$$;

revoke execute on function public.match_chunks from public, anon, authenticated;
grant execute on function public.match_chunks to service_role;

-- ---------------------------------------------------------------------------
-- Private storage bucket for source PDFs
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 104857600, array['application/pdf'])
on conflict (id) do nothing;
