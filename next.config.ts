import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// COOP/COEP are required by debugger-sh to use SharedArrayBuffer for stdin.
// Applied via Next headers() for both `next dev` and the OpenNext Worker.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // Keep the prebundled debugger-sh dist from being re-compiled oddly by Next.
  transpilePackages: ['debugger-sh'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;

// Only for `next dev` — running this during `next build` / OpenNext breaks page collection.
if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev();
}
