export type ShareEnv = {
  url: string;
  key: string;
};

/**
 * Resolve Supabase env for server use (SSR + server actions).
 * Prefer Cloudflare Worker secrets; fall back to process.env (`.env.local` in `next dev`).
 */
export async function resolveShareEnv(): Promise<ShareEnv | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      return {
        url: env.NEXT_PUBLIC_SUPABASE_URL,
        key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      };
    }
  } catch {
    // Outside the Workers runtime (e.g. plain `next dev` / build).
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}
