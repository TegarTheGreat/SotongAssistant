import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Katalog model dari models.dev — database open-source berisi provider,
 * model, harga, dan limit. https://models.dev/api.json
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
  /** Paket AI SDK — menentukan protokol wire (mis. @ai-sdk/anthropic, @ai-sdk/openai-compatible). */
  npm?: string;
  /** Base URL untuk provider OpenAI-compatible. */
  api?: string;
  /** Nama env var API key, mis. ["ANTHROPIC_API_KEY"]. */
  env?: string[];
  doc?: string;
  models: Record<string, CatalogModel>;
}

export type Catalog = Record<string, CatalogProvider>;

const CACHE_FILE = () => path.join(config.dataDir, "models-cache.json");
const TTL_MS = 24 * 3600_000;

/** Fallback minimal bila models.dev tak terjangkau dan belum ada cache. */
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

let mem: { catalog: Catalog; at: number } | undefined;

export async function getCatalog(): Promise<Catalog> {
  if (mem && Date.now() - mem.at < TTL_MS) return mem.catalog;

  // 1. cache file yang masih segar
  if (existsSync(CACHE_FILE())) {
    try {
      const raw = JSON.parse(readFileSync(CACHE_FILE(), "utf8")) as { at: number; catalog: Catalog };
      if (Date.now() - raw.at < TTL_MS) {
        mem = { catalog: raw.catalog, at: raw.at };
        return raw.catalog;
      }
    } catch {
      /* cache rusak — abaikan */
    }
  }

  // 2. fetch live
  try {
    const res = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
    const data = (await res.json()) as Catalog;
    for (const [pid, p] of Object.entries(data)) {
      p.id = pid;
      for (const [mid, m] of Object.entries(p.models ?? {})) m.id = mid;
    }
    mem = { catalog: data, at: Date.now() };
    writeFileSync(CACHE_FILE(), JSON.stringify({ at: mem.at, catalog: data }));
    return data;
  } catch (err) {
    console.warn("Gagal fetch models.dev, pakai cache lama/fallback:", (err as Error).message);
  }

  // 3. cache basi lebih baik daripada tidak ada
  if (existsSync(CACHE_FILE())) {
    try {
      const raw = JSON.parse(readFileSync(CACHE_FILE(), "utf8")) as { at: number; catalog: Catalog };
      mem = { catalog: raw.catalog, at: Date.now() };
      return raw.catalog;
    } catch {
      /* jatuh ke fallback */
    }
  }
  mem = { catalog: FALLBACK, at: Date.now() };
  return FALLBACK;
}

/** Provider populer ditampilkan duluan di menu pemilihan. */
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
  const all = Object.values(catalog);
  const rank = (p: CatalogProvider) => {
    const i = POPULAR_PROVIDERS.indexOf(p.id);
    return i === -1 ? POPULAR_PROVIDERS.length : i;
  };
  return all.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
