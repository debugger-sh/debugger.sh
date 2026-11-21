import type { NextConfig } from "next";

// COOP/COEP are required by debugger-sh, whose filesystem and pipes use SharedArrayBuffer.
//
// Production (Cloudflare Workers Static Assets): set via `public/_headers`,
// which is copied into `out/_headers` and read by the Workers asset server.
//
// Local dev (`next dev`): `_headers` is a Cloudflare convention and is NOT
// honored by the Next dev server, so we also keep the `headers()` config
// below. It's a no-op for `next build` with `output: 'export'`.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: "/:path+", destination: "/" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
