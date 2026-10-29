import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// CF CI runs `npm run build` then `wrangler deploy`. `build` must produce
// `.open-next/`; OpenNext would recurse if it invoked `npm run build` again.
const config = defineCloudflareConfig();
config.buildCommand = 'npm run build:next';
export default config;
