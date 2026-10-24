import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// Static site; only src/pages/api/chat.ts runs on the server (prerender = false).
export default defineConfig({
  adapter: vercel(),
  env: {
    schema: {
      // server-only secret: never exposed to the browser
      GEMINI_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
