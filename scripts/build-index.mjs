// build-index.mjs — turns the knowledge files + site content into a searchable embedding index.
// Run automatically before `astro build` (see package.json). Output: src/data/knowledge-index.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'src/data/knowledge-index.json');
const MODEL = 'gemini-embedding-001';
const DIMS = 768;
const MAX_CHUNK = 1400;

/* ---------- env (works with or without a .env file, e.g. on Vercel) ---------- */
function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv();

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* ---------- markdown helpers ---------- */
const stripNoise = (md) =>
  md
    .replace(/<!--[\s\S]*?-->/g, '') // html comments
    .split(/\r?\n/)
    .filter((l) => !/<[^>\n]*>/.test(l)) // leftover <placeholder> lines
    .join('\n');

const tidy = (s) => s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

function splitLong(text) {
  if (text.length <= MAX_CHUNK) return [text];
  const parts = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > MAX_CHUNK && cur) { parts.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** Split a knowledge markdown file into {title, text} sections by ##/### headings. */
function sections(md) {
  const out = [];
  let h2 = '', h3 = '', buf = [];
  const flush = () => {
    const body = tidy(buf.join('\n'));
    if (body) out.push({ h2, h3, body });
    buf = [];
  };
  for (const line of md.split('\n')) {
    const m2 = line.match(/^##\s+(.*)/), m3 = line.match(/^###\s+(.*)/);
    if (m2) { flush(); h2 = m2[1].trim(); h3 = ''; }
    else if (m3) { flush(); h3 = m3[1].trim(); }
    else if (!/^#\s/.test(line)) buf.push(line);
  }
  flush();
  return out;
}

/* ---------- 1. Harshit_deets.md ---------- */
/** Private notes: knowledge/Harshit_deets.md locally, or an env var (e.g. on Vercel):
 *  KNOWLEDGE_DEETS_B64 = the file base64-encoded on ONE line (safe in single-line fields), or
 *  KNOWLEDGE_DEETS     = the raw multi-line text. */
function loadDeets() {
  if (fs.existsSync(path.join(root, 'knowledge/Harshit_deets.md'))) return read('knowledge/Harshit_deets.md');
  if (process.env.KNOWLEDGE_DEETS_B64?.trim()) return Buffer.from(process.env.KNOWLEDGE_DEETS_B64.trim(), 'base64').toString('utf8');
  if (process.env.KNOWLEDGE_DEETS?.trim()) return process.env.KNOWLEDGE_DEETS;
  return null;
}

function fromDeets() {
  const text = loadDeets();
  if (!text) {
    console.warn('[pokko] no personal notes found (knowledge/Harshit_deets.md, KNOWLEDGE_DEETS_B64 or KNOWLEDGE_DEETS) — indexing public site content only.');
    return { chunks: [], rules: [], blocked: [] };
  }
  const raw = stripNoise(text);
  const chunks = [];
  let rules = [], blocked = [];

  for (const s of sections(raw)) {
    if (/^off-limits/i.test(s.h2)) {
      for (const l of s.body.split('\n')) {
        const line = l.replace(/^\s*[-*]\s*/, '').trim();
        if (!line) continue;
        const emails = [...line.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0].toLowerCase());
        if (/do not|don't|never|must not/i.test(line) && emails.length) {
          blocked.push(...emails);
          rules.push(line.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[a blocked address]'));
        } else rules.push(line);
      }
      continue; // rules are not searchable knowledge
    }
    if (/^frequently asked/i.test(s.h2)) {
      const qa = s.body.split(/\n(?=\*\*Q:)/);
      for (const block of qa) {
        const t = tidy(block.replace(/\*\*/g, ''));
        if (t.startsWith('Q:')) chunks.push({ source: 'deets', title: 'FAQ', text: `FAQ\n${t}` });
      }
      continue;
    }
    const title = [s.h2, s.h3].filter(Boolean).join(' > ');
    // Strengths mixes unrelated facts (events, hackathons, SIH...), which blurs its embedding:
    // index each bullet on its own so a question like "did he win anything?" finds the right one.
    const parts = /^strengths$/i.test(s.h2)
      ? s.body.split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean)
      : splitLong(s.body);
    for (const part of parts) {
      chunks.push({ source: 'deets', title, text: `${title}\n${part}` });
    }
  }
  return { chunks, rules, blocked: [...new Set(blocked)] };
}

/* ---------- 2. site-facts.md ---------- */
function fromFacts() {
  return sections(stripNoise(read('knowledge/site-facts.md'))).map((s) => ({
    source: 'site', title: s.h2, text: `${s.h2}\n${s.body}`,
  }));
}

/* ---------- 3. content collections (projects, experience) ---------- */
function frontmatter(file) {
  const m = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { data: YAML.parse(m[1]) ?? {}, body: tidy(m[2]) } : { data: {}, body: '' };
}

function fromContent() {
  const chunks = [];
  const dir = (d) => {
    const p = path.join(root, 'src/content', d);
    return fs.existsSync(p) ? fs.readdirSync(p).filter((f) => f.endsWith('.md')).map((f) => path.join(p, f)) : [];
  };
  for (const file of dir('projects')) {
    const { data: d, body } = frontmatter(file);
    if (d.draft) continue;
    const lines = [`Project: ${d.title}`, `Field: ${d.category}`, body];
    if (d.hot) lines.push(`Highlight: ${d.hot}`);
    if (d.tags?.length) lines.push(`Tech and tags: ${d.tags.join(', ')}`);
    if (d.github) lines.push(`GitHub repo: ${d.github}`);
    if (d.figma) lines.push(`Figma design: ${d.figma}`);
    if (d.link) lines.push(`Live demo: ${d.link}`);
    chunks.push({ source: 'project', title: d.title, text: lines.filter(Boolean).join('\n') });
  }
  for (const file of dir('experience')) {
    const { data: d } = frontmatter(file);
    if (d.draft) continue;
    const lines = [
      `Experience: ${d.role} at ${d.company}${d.location ? ', ' + d.location : ''}`,
      `Period: ${d.period}`,
      `Type: ${d.type}`,
      ...(d.bullets ?? []).map((b) => `- ${b}`),
    ];
    chunks.push({ source: 'experience', title: `${d.role}, ${d.company}`, text: lines.join('\n') });
  }
  return chunks;
}

/* ---------- embeddings ---------- */
const normalize = (v) => {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => Number((x / n).toFixed(5)));
};

async function embed(texts, key) {
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: DIMS,
        })),
      }),
    });
    if (!res.ok) throw new Error(`Embedding request failed (${res.status}): ${(await res.text()).slice(0, 300).replace(key, '***')}`);
    const j = await res.json();
    out.push(...j.embeddings.map((e) => normalize(e.values)));
  }
  return out;
}

/* ---------- main ---------- */
const deets = fromDeets();
const all = [...deets.chunks, ...fromFacts(), ...fromContent()].map((c, i) => ({
  id: `${c.source}-${i}`, hash: sha(`${MODEL}|${DIMS}|${c.text}`), ...c,
}));

let prev = { chunks: [] };
try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
const cache = new Map(prev.chunks.map((c) => [c.hash, c.embedding]));

const key = process.env.GEMINI_API_KEY;
const todo = all.filter((c) => !cache.has(c.hash));

if (todo.length && !key) {
  if (prev.chunks.length) {
    console.warn('[pokko] GEMINI_API_KEY not set — keeping the existing index (content changes were NOT indexed).');
    process.exit(0);
  }
  // fresh clone without a key: build an empty index so the site still builds; Pokko shows as unavailable
  console.warn('[pokko] GEMINI_API_KEY is not set — building without a chat index. Pokko stays offline until a key is added (see .env.example).');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, dims: DIMS, builtAt: new Date().toISOString(), rules: deets.rules, blocked: deets.blocked, chunks: [] }));
  process.exit(0);
}

if (todo.length) {
  console.log(`[pokko] embedding ${todo.length} new/changed chunk(s) (${all.length - todo.length} cached)…`);
  const vecs = await embed(todo.map((c) => c.text), key);
  todo.forEach((c, i) => cache.set(c.hash, vecs[i]));
}

const index = {
  model: MODEL,
  dims: DIMS,
  builtAt: new Date().toISOString(),
  rules: deets.rules,
  blocked: deets.blocked,
  chunks: all.map((c) => ({ id: c.id, hash: c.hash, source: c.source, title: c.title, text: c.text, embedding: cache.get(c.hash) })),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(index));
console.log(`[pokko] index ready: ${index.chunks.length} chunks, ${deets.rules.length} rule(s), ${deets.blocked.length} blocked address(es), ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
