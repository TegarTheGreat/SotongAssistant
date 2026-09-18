import { getCatalog } from "./catalog.js";
import { recordAiSpend } from "../db/repo.js";
import type { TokenUsage } from "./ai/index.js";

/**
 * Per-chat AI spend accounting.
 *
 * Cost comes from the models.dev catalog, whose `cost.input` / `cost.output`
 * are US dollars per MILLION tokens. A model with no pricing (self-hosted,
 * free tier, missing entry) contributes tokens but zero cost — reporting an
 * invented price would be worse than reporting none.
 *
 * When a provider does not return usage, tokens are ESTIMATED at ~4 characters
 * per token. That is deliberately rough: the number exists to show which chats
 * dominate the bill, not to reconcile an invoice.
 */

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Record one AI call against a chat. Never throws: accounting must not be able
 * to break an answer that already reached the user.
 */
export async function trackAiSpend(opts: {
  chatId: number;
  providerId: string;
  modelId: string;
  /** Reported usage, when the provider gave one. */
  usage?: TokenUsage;
  /** Fallback material for the estimate when usage is absent. */
  promptText?: string;
  answerText?: string;
}): Promise<void> {
  try {
    const inTokens = opts.usage?.inputTokens ?? estimateTokens(opts.promptText ?? "");
    const outTokens = opts.usage?.outputTokens ?? estimateTokens(opts.answerText ?? "");
    if (!inTokens && !outTokens) return;

    const model = (await getCatalog())[opts.providerId]?.models?.[opts.modelId];
    const cost =
      ((model?.cost?.input ?? 0) * inTokens + (model?.cost?.output ?? 0) * outTokens) / 1_000_000;

    recordAiSpend(opts.chatId, inTokens, outTokens, cost, opts.providerId, opts.modelId);
  } catch (err) {
    console.warn("spend accounting failed:", (err as Error).message);
  }
}

/** Compact money formatting: sub-cent amounts still need to be visible. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "0.00";
  if (usd < 0.01) return usd.toFixed(4);
  return usd.toFixed(2);
}

/** Compact token counts for narrow Telegram/dashboard rows. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
