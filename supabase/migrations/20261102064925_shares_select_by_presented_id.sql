-- Listing shares is public-API reachable. Require the caller to present the
-- share id in a request header so a select without that capability returns no rows.
-- PostgREST copies headers into request.headers; names are lowercased.
drop policy if exists "Anyone can read shares" on public.shares;

create policy "read shares"
  on public.shares
  for select
  to anon, authenticated
  using (
    id = nullif(
      (select current_setting('request.headers', true))::json ->> 'x-share-id',
      ''
    )
  );
