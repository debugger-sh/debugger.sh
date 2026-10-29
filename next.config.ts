import type { NextConfig } from "next";

// COOP/COEP are required by debugger-sh to use SharedArrayBuffer for stdin.
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
  // Keep the prebundled debugger-sh dist from being re-compiled oddly by Next.
  transpilePackages: ["debugger-sh"],
  async rewrites() {
    return [{ source: "/:shareId([0-9A-Za-z]{8,16})", destination: "/" }];
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
