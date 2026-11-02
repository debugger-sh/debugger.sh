-- Append-only client telemetry. The browser stamps `timestamp`; there is no server default.
-- RLS allows insert only. Event names and payloads are not checked.
create table public.telemetry (
  id bigint generated always as identity primary key,
  session_id text not null,
  timestamp timestamptz not null,
  event text not null,
  details jsonb
);

alter table public.telemetry enable row level security;

revoke all on table public.telemetry from public, anon, authenticated;
grant insert on table public.telemetry to anon, authenticated;

create policy "insert telemetry"
  on public.telemetry
  for insert
  to anon, authenticated
  with check (true);
