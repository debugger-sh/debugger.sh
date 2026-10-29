-- Shares may store evolving workspace snapshots (code, layout, …).
-- Drop structural checks on `state`; clients validate what they need.
drop policy if exists "Anyone can create shares" on public.shares;

create policy "Anyone can create shares"
  on public.shares
  for insert
  to anon, authenticated
  with check (true);
