import { createHash } from "node:crypto";
import { getCatalog } from "./catalog.js";
import { resolveApiKey } from "./ai/index.js";

/**
 * Semantic retrieval for /recall.
 *
 * Strategy is a HYBRID that keeps cost bounded and predictable:
 *  1. a cheap lexical prefilter picks the best candidates locally,
 *  2. one batched embeddings call scores query + candidates,
 *  3. results are re-ranked by cosine similarity.
 *
 * So a /recall costs exactly ONE embeddings request regardless of log size,
 * and any failure (no OpenAI key, provider outage) returns undefined so the
 * caller silently keeps its lexical ordering.
 *
 * Vectors are also CACHED by text hash, so repeated /recall calls only pay for
 * messages the cache has not seen — a second search over the same history
 * embeds just the query.
 */

const EMBED_MODEL = "text-embedding-3-small";
const MAX_CANDIDATES = 40;
/** Bounded in-memory vector cache, keyed by a hash of the exact text. */
const CACHE_CAP = 4000;
const vectorCache = new Map<string, number[]>();

function cacheKey(text: string): string {
  return createHash("sha1").update(text).digest("base64");
}

function cacheGet(text: string): number[] | undefined {
  const k = cacheKey(text);
  const hit = vectorCache.get(k);
  if (hit) {
    // Refresh recency so hot entries survive eviction (poor-man's LRU).
    vectorCache.delete(k);
    vectorCache.set(k, hit);
  }
  return hit;
}

function cacheSet(text: string, vec: number[]): void {
  if (vectorCache.size >= CACHE_CAP) {
    // Drop the oldest ~10% in insertion order.
    let drop = Math.ceil(CACHE_CAP * 0.1);
    for (const k of vectorCache.keys()) {
      vectorCache.delete(k);
      if (--drop <= 0) break;
    }
  }
  vectorCache.set(cacheKey(text), vec);
}

/** Test/introspection helper: how many vectors are currently cached. */
export function embeddingCacheSize(): number {
  return vectorCache.size;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm === 0 ? 0 : dot / norm;
}

/** Embed several texts in one request. Returns undefined when unavailable. */
async function embedBatch(texts: string[]): Promise<number[][] | undefined> {
  const provider = (await getCatalog())["openai"];
  const apiKey = provider ? resolveApiKey(provider) : undefined;
  if (!apiKey || !texts.length) return undefined;
  const base = (provider!.api ?? "https://api.openai.com/v1").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts.map((t) => t.slice(0, 2000)) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: Array<{ embedding?: number[]; index?: number }> };
    const rows = json.data;
    if (!rows?.length) return undefined;
    // The API may return items out of order — restore it via `index`.
    const out: number[][] = new Array(texts.length);
    rows.forEach((r, i) => {
      if (r.embedding) out[r.index ?? i] = r.embedding;
    });
    return out.every(Array.isArray) ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Re-rank candidates against the query by meaning.
 * Returns the candidates sorted best-first, or undefined to keep the caller's
 * own (lexical) ordering.
 */
export async function semanticRerank<T>(
  query: string,
  candidates: T[],
  textOf: (item: T) => string,
): Promise<T[] | undefined> {
  const pool = candidates.slice(0, MAX_CANDIDATES);
  if (pool.length < 2) return undefined;

  // Only texts the cache has never seen go to the API; the query is always
  // fresh (it is new by definition, and caching queries would bloat the map).
  const texts = pool.map(textOf);
  const misses = [...new Set(texts.filter((t) => !cacheGet(t)))];
  const fetched = await embedBatch([query, ...misses]);
  if (!fetched) return undefined;
  const queryVec = fetched[0];
  if (!queryVec) return undefined;
  misses.forEach((text, i) => {
    const vec = fetched[i + 1];
    if (vec) cacheSet(text, vec);
  });

  return pool
    .map((item, i) => {
      const vec = cacheGet(texts[i]!);
      return { item, score: vec ? cosine(queryVec, vec) : -1 };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

/** Whether semantic search is configured (an OpenAI key exists). */
export async function semanticAvailable(): Promise<boolean> {
  const provider = (await getCatalog())["openai"];
  return Boolean(provider && resolveApiKey(provider));
}
