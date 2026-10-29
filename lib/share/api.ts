import { LANGS, type Lang } from '@/components/constants';
import { parseDockState } from '@/components/dock/types';

import { getSupabase } from './client';
import { isShareId, shortId } from './id';
import type { WorkspaceState } from './types';

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && value in LANGS;
}

export function parseWorkspaceState(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isLang(record.lang) || typeof record.code !== 'string') return null;
  const layout = parseDockState(record.layout);
  return layout
    ? { lang: record.lang, code: record.code, layout }
    : { lang: record.lang, code: record.code };
}

export async function createShare(state: WorkspaceState): Promise<string> {
  const parsed = parseWorkspaceState(state);
  if (!parsed) throw new Error('Invalid workspace state');

  const id = shortId();
  const { error } = await getSupabase().from('shares').insert({ id, state: parsed });
  if (error) throw error;
  return id;
}

export async function getShare(id: string): Promise<WorkspaceState | null> {
  if (!isShareId(id)) return null;

  const { data, error } = await getSupabase()
    .from('shares')
    .select('state')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return parseWorkspaceState(data?.state);
}

/** Path URL; Cloudflare SPA fallback serves `/` for unknown paths. */
export function shareUrl(id: string): string {
  return `${window.location.origin}/${id}`;
}

export { isShareId } from './id';
