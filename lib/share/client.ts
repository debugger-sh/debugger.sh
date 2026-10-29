import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { resolveShareEnv } from './env';

let client: SupabaseClient | null = null;
let clientKey: string | null = null;

/** Server-only Supabase client (Worker secrets or `.env.local`). */
export async function getSupabase(): Promise<SupabaseClient> {
  const env = await resolveShareEnv();
  if (!env) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.local.example (local) or `wrangler secret put` (production).',
    );
  }
  const key = `${env.url}\0${env.key}`;
  if (client && clientKey === key) return client;
  client = createClient(env.url, env.key);
  clientKey = key;
  return client;
}
