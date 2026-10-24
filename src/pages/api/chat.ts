import type { APIRoute } from 'astro';
import { GEMINI_API_KEY } from 'astro:env/server';
import index from '../../data/knowledge-index.json';
import {
  PokkoError, OutputFilter, buildContext, buildSystemPrompt, embedQuery, retrievalQuery,
  retrieve, streamAnswer, validateMessages,
} from '../../lib/pokko-core.js';

// Runs on the server only; the rest of the site is static.
export const prerender = false;

/* ---- abuse protection ----
   In-memory counters: they reset when a serverless instance restarts, so this is a cheap first line
   of defence. For a hard guarantee, also set a quota/budget on the Gemini key. */
const PER_IP = { max: 12, windowMs: 10 * 60 * 1000 };
const GLOBAL_PER_DAY = 600;
const hits = new Map<string, { n: number; reset: number }>();
let day = { n: 0, reset: Date.now() + 24 * 60 * 60 * 1000 };

function limited(ip: string): string | null {
  const now = Date.now();
  if (now > day.reset) day = { n: 0, reset: now + 24 * 60 * 60 * 1000 };
  if (++day.n > GLOBAL_PER_DAY) return "Pokko has answered a lot of questions today and needs a nap. Please try again tomorrow, or email Harshit directly.";

  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  const h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { n: 1, reset: now + PER_IP.windowMs }); return null; }
  return ++h.n > PER_IP.max ? "That's a lot of questions! Pokko needs a short break. Please try again in a few minutes." : null;
}

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // same-origin only: blocks other websites from using this endpoint from a browser
  const origin = request.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).host !== new URL(request.url).host) return json({ error: 'Forbidden.' }, 403); }
    catch { return json({ error: 'Forbidden.' }, 403); }
  }
  if (!GEMINI_API_KEY || !(index as { chunks: unknown[] }).chunks.length) return json({ error: 'Pokko is not set up yet.' }, 503);

  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const v = validateMessages(body as never);
  if (v.error) return json({ error: v.error }, 400);

  let ip = 'unknown';
  try { ip = clientAddress; } catch {}
  const blockedMsg = limited(ip);
  if (blockedMsg) return json({ error: blockedMsg }, 429, { 'retry-after': '300' });

  try {
    const t0 = Date.now();
    const qvec = await embedQuery(retrievalQuery(v.messages!), GEMINI_API_KEY);
    const tEmbed = Date.now() - t0;
    const picked = retrieve(index as never, qvec, { queryText: retrievalQuery(v.messages!) });
    let used = { attempt: 0, model: '' };
    const stream = streamAnswer({
      key: GEMINI_API_KEY,
      system: buildSystemPrompt((index as { rules?: string[] }).rules),
      messages: v.messages!,
      contextText: buildContext(picked),
      signal: request.signal,
      onAttempt: (a: { attempt: number; model: string }) => { used = a; },
    });
    const filter = new OutputFilter((index as { blocked?: string[] }).blocked);

    // pull the first chunk now so upstream failures can still return a proper error status
    const iter = stream[Symbol.asyncIterator]();
    let first = await iter.next();
    const tFirst = Date.now() - t0 - tEmbed;
    const enc = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let sent = false;
        try {
          while (!first.done) {
            const out = filter.push(first.value as string);
            if (out) { controller.enqueue(enc.encode(out)); sent = true; }
            first = await iter.next();
          }
          const rest = filter.flush();
          if (rest) { controller.enqueue(enc.encode(rest)); sent = true; }
          if (!sent) controller.enqueue(enc.encode("Meow? I couldn't answer that one. Try asking it differently, or email Harshit directly."));
        } catch {
          controller.enqueue(enc.encode('\n\n(Pokko got interrupted. Please try again.)'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
        // where the time went: embedding the question vs waiting for the model's first words (and which attempt answered)
        'server-timing': `embed;dur=${tEmbed}, llm;dur=${tFirst};desc="attempt ${used.attempt} ${used.model}"`,
      },
    });
  } catch (e) {
    console.error('[pokko] request failed:', e instanceof Error ? e.message : e);
    // short, secret-free reason for debugging (the visitor only sees the friendly message)
    const reason = e instanceof Error ? e.message.slice(0, 120) : 'unknown';
    if (e instanceof PokkoError) return json({ error: e.userMessage }, e.status === 429 ? 429 : 502, { 'x-pokko-reason': reason });
    return json({ error: 'Pokko got confused. Please try again in a moment.' }, 500, { 'x-pokko-reason': reason });
  }
};

// anything else is not allowed
export const ALL: APIRoute = () => json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
