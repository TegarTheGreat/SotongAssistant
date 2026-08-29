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
 */

const EMBED_MODEL = "text-embedding-3-small";
const MAX_CANDIDATES = 40;

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
  const vectors = await embedBatch([query, ...pool.map(textOf)]);
  if (!vectors) return undefined;
  const [queryVec, ...itemVecs] = vectors;
  if (!queryVec) return undefined;
  return pool
    .map((item, i) => ({ item, score: itemVecs[i] ? cosine(queryVec, itemVecs[i]!) : -1 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

/** Whether semantic search is configured (an OpenAI key exists). */
export async function semanticAvailable(): Promise<boolean> {
  const provider = (await getCatalog())["openai"];
  return Boolean(provider && resolveApiKey(provider));
}
