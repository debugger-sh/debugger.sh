import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.local.example"
    );
  }
  return { url, key };
}

export function getSupabase(shareId?: string): SupabaseClient {
  const { url, key } = supabaseEnv();
  if (shareId) {
    return createClient(url, key, {
      global: { headers: { "x-share-id": shareId } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  if (!client) client = createClient(url, key);
  return client;
}
