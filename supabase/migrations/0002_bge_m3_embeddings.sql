-- Switch embeddings from local multilingual-e5-small (384 dims) to bge-m3 on
-- Cloudflare Workers AI (1024 dims). Old vectors can't be converted, so the column is
-- replaced; run `npm run reembed` afterwards to fill it from the stored chunk text.

drop index if exists public.chunks_embedding_idx;
alter table public.chunks drop column embedding;
-- Nullable only until `npm run reembed` fills existing rows; ingest always sets it.
alter table public.chunks add column embedding extensions.vector(1024);
create index chunks_embedding_idx on public.chunks
  using hnsw (embedding extensions.vector_cosine_ops);

drop function if exists public.match_chunks(extensions.vector, text, int, text, int);

create or replace function public.match_chunks(
  query_embedding extensions.vector(1024),
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
      and c.embedding is not null
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
