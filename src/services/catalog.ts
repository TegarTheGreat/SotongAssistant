import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Model catalog from models.dev — an open-source database of AI providers,
 * models, pricing and limits. https://models.dev/api.json
 */

export interface CatalogModel {
  id: string;
  name?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  cost?: { input?: number; output?: number };
  limit?: { context?: number; output?: number };
}

export interface CatalogProvider {
  id: string;
  name?: string;
  /** AI SDK package name — determines the wire protocol (e.g. @ai-sdk/anthropic). */
  npm?: string;
  /** Base URL for OpenAI-compatible providers. */
  api?: string;
  /** Env var names holding the API key, e.g. ["ANTHROPIC_API_KEY"]. */
  env?: string[];
  doc?: string;
  models: Record<string, CatalogModel>;
}

export type Catalog = Record<string, CatalogProvider>;

const CACHE_FILE = () => path.join(config.dataDir, "models-cache.json");
const FRESH_TTL_MS = 24 * 3600_000;
/** After a failed fetch, retry soon instead of pinning the fallback for a day. */
const FAILURE_RETRY_MS = 5 * 60_000;

/** Minimal fallback so the bot still works if models.dev is unreachable on first boot. */
const FALLBACK: Catalog = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    npm: "@ai-sdk/anthropic",
    env: ["ANTHROPIC_API_KEY"],
    models: {
      "claude-opus-5": { id: "claude-opus-5", name: "Claude Opus 5" },
      "claude-sonnet-5": { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      "claude-haiku-4-5": { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    npm: "@ai-sdk/openai",
    env: ["OPENAI_API_KEY"],
    models: { "gpt-5": { id: "gpt-5", name: "GPT-5" } },
  },
};

let mem: { catalog: Catalog; at: number; ttl: number } | undefined;

function normalize(data: Catalog): Catalog {
  for (const [pid, p] of Object.entries(data)) {
    p.id = pid;
    p.models = p.models ?? {}; // some entries may lack models — never let consumers crash
    for (const [mid, m] of Object.entries(p.models)) m.id = mid;
  }
  return data;
}

export async function getCatalog(): Promise<Catalog> {
  if (mem && Date.now() - mem.at < mem.ttl) return mem.catalog;

  // 1. fresh file cache
  if (existsSync(CACHE_FILE())) {
    try {
      const raw = JSON.parse(readFileSync(CACHE_FILE(), "utf8")) as { at: number; catalog: Catalog };
      if (Date.now() - raw.at < FRESH_TTL_MS) {
        mem = { catalog: normalize(raw.catalog), at: raw.at, ttl: FRESH_TTL_MS };
        return mem.catalog;
      }
    } catch {
      /* corrupted cache — ignore */
    }
  }

  // 2. live fetch
  try {
    const res = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
    const data = normalize((await res.json()) as Catalog);
    mem = { catalog: data, at: Date.now(), ttl: FRESH_TTL_MS };
    writeFileSync(CACHE_FILE(), JSON.stringify({ at: mem.at, catalog: data }));
    return data;
  } catch (err) {
    console.warn("models.dev fetch failed, using stale cache/fallback:", (err as Error).message);
  }

  // 3. stale cache beats nothing; retry soon either way
  if (existsSync(CACHE_FILE())) {
    try {
      const raw = JSON.parse(readFileSync(CACHE_FILE(), "utf8")) as { at: number; catalog: Catalog };
      mem = { catalog: normalize(raw.catalog), at: Date.now(), ttl: FAILURE_RETRY_MS };
      return mem.catalog;
    } catch {
      /* fall through to FALLBACK */
    }
  }
  mem = { catalog: FALLBACK, at: Date.now(), ttl: FAILURE_RETRY_MS };
  return FALLBACK;
}

/** Popular providers are listed first in the picker menu. */
export const POPULAR_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "groq",
  "openrouter",
  "deepseek",
  "mistral",
  "xai",
];

export function sortProviders(catalog: Catalog): CatalogProvider[] {
  const all = Object.values(catalog).filter((p) => Object.keys(p.models ?? {}).length > 0);
  const rank = (p: CatalogProvider) => {
    const i = POPULAR_PROVIDERS.indexOf(p.id);
    return i === -1 ? POPULAR_PROVIDERS.length : i;
  };
  return all.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
