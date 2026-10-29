-- Shared workspace snapshots. `state` is jsonb so we can grow beyond code/lang later.
-- Client-side access via anon key + RLS (static export has no server).
create table public.shares (
  id text primary key,
  state jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shares enable row level security;

-- Public share links: anyone can create a snapshot and anyone can read by id.
-- No update/delete policies — shares are immutable from the client.
create policy "Anyone can create shares"
  on public.shares
  for insert
  to anon, authenticated
  with check (
    id ~ '^[0-9A-Za-z]{8,16}$'
    and jsonb_typeof(state) = 'object'
    and state ? 'lang'
    and state ? 'code'
    and jsonb_typeof(state -> 'code') = 'string'
  );

create policy "Anyone can read shares"
  on public.shares
  for select
  to anon, authenticated
  using (true);
