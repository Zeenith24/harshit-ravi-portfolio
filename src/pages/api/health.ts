import type { APIRoute } from 'astro';
import { GEMINI_API_KEY } from 'astro:env/server';
import index from '../../data/knowledge-index.json';
import { CHAT_MODEL, FALLBACK_MODEL } from '../../lib/pokko-core.js';

// Server-only. Reports counts and a short fingerprint, never any of the notes' text or the key.
export const prerender = false;

export const GET: APIRoute = () => {
  const bySource: Record<string, number> = {};
  for (const c of (index as { chunks: { source: string }[] }).chunks) bySource[c.source] = (bySource[c.source] ?? 0) + 1;
  const i = index as { builtAt?: string; model?: string; rules?: string[]; blocked?: string[]; notes?: { chars: number; sha1: string } | null };
  return new Response(
    JSON.stringify({
      ok: Boolean(GEMINI_API_KEY) && Object.keys(bySource).length > 0,
      keyConfigured: Boolean(GEMINI_API_KEY),
      builtAt: i.builtAt ?? null,
      embeddingModel: i.model ?? null,
      chatModel: CHAT_MODEL,
      fallbackModel: FALLBACK_MODEL,
      chunks: bySource,
      rules: i.rules?.length ?? 0,
      blockedAddresses: i.blocked?.length ?? 0,
      notes: i.notes ?? null, // { chars, sha1 }: compare with `npm run index` output locally
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } },
  );
};
