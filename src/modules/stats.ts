import { Composer, type Context } from "grammy";
import { config } from "../config.js";
import { getSettings, messageStats, allLoggedMessages, getMemory } from "../db/repo.js";
import { getCatalog } from "../services/catalog.js";
import { streamCompletion } from "../services/ai/index.js";
import { semanticRerank } from "../services/embeddings.js";
import { escapeHtml, markdownToTelegramHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Activity analytics on top of the ambient message log (explicit opt-in):
 *  - /stats — 24h/7d counters, a per-day bar chart, most active members
 *  - /recall <words> — hybrid search (lexical + embeddings) over recent
 *    messages, followed by an AI answer grounded in the matches
 */
export const stats = new Composer<Context>();

const BAR_MAX = 12;

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

stats.command("stats", async (ctx) => {
  if (!isGroup(ctx)) return;
  if (!getSettings(ctx.chat.id).ambient) {
    await ctx.reply(tc(ctx, "ai.summarizeOff"));
    return;
  }
  const s = messageStats(ctx.chat.id);
  if (!s.total7d) {
    await ctx.reply(tc(ctx, "stats.empty"));
    return;
  }
  const peak = Math.max(...s.perDay.map((d) => d.count), 1);
  const chart = s.perDay
    .map((d) => {
      const bar = "▇".repeat(Math.max(1, Math.round((d.count / peak) * BAR_MAX)));
      return `<code>${d.day.slice(5)}</code> ${bar} ${d.count}`;
    })
    .join("\n");
  const top = s.topUsers
    .map((u, i) => `${["🥇", "🥈", "🥉"][i] ?? "▫️"} ${escapeHtml(u.name)} — ${u.count}`)
    .join("\n");
  await ctx.reply(
    `${tc(ctx, "stats.title", { h24: s.total24h, d7: s.total7d })}\n\n${chart}\n\n${tc(ctx, "stats.top")}\n${top}`,
    { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) },
  );
});

// /recall — hybrid retrieval: lexical scoring, then semantic re-ranking when
// embeddings are available, then an AI answer grounded in the top matches.
stats.command("recall", async (ctx) => {
  if (!isGroup(ctx)) return;
  if (!getSettings(ctx.chat.id).ambient) {
    await ctx.reply(tc(ctx, "ai.summarizeOff"));
    return;
  }
  const query = ctx.match.trim().toLowerCase();
  if (query.length < 3) {
    await ctx.reply(tc(ctx, "recall.usage"));
    return;
  }
  const terms = query.split(/\s+/).filter((w) => w.length > 2);
  if (!terms.length) {
    await ctx.reply(tc(ctx, "recall.usage"));
    return;
  }
  const all = allLoggedMessages(ctx.chat.id);
  const lexical = all
    .map((m) => {
      const hay = m.text.toLowerCase();
      const score = terms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0);
      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || b.ts - a.ts);

  // Semantic pass: the candidate pool deliberately includes recent messages
  // that share NO words with the query, because that is exactly what meaning
  // based search is for. Falls back to pure lexical when embeddings are
  // unavailable (no OpenAI key, provider down).
  const pool = [...lexical, ...all.filter((m) => !lexical.some((l) => l.ts === m.ts && l.text === m.text))].slice(0, 40);
  const reranked = await semanticRerank(query, pool, (m) => m.text);
  const scored = (reranked ?? lexical).slice(0, 5);
  if (!scored.length) {
    await ctx.reply(tc(ctx, "recall.empty"));
    return;
  }
  const rows = scored
    .map((m) => `• <b>${escapeHtml(m.name ?? "?")}</b>: ${escapeHtml(m.text.slice(0, 160))}`)
    .join("\n");
  await ctx.reply(`${tc(ctx, "recall.title")}\n${rows}`, {
    parse_mode: "HTML",
    message_thread_id: threadIdOf(ctx),
  });

  // Semantic layer: let the chat's model synthesize an answer from the raw
  // matches plus long-term memory. Best-effort — the lexical list above
  // already answered, so any AI failure stays silent.
  const settings = getSettings(ctx.chat.id);
  if (!settings.ai) return;
  try {
    const provider = (await getCatalog())[settings.aiProvider ?? config.defaultProvider];
    if (!provider) return;
    const memory = getMemory(String(ctx.chat.id)).summary;
    const evidence = scored.map((m) => `${m.name ?? "?"}: ${m.text}`).join("\n").slice(0, 6000);
    const answer = await streamCompletion(
      {
        provider,
        model: settings.aiModel ?? config.defaultModel,
        system:
          "You answer questions about a group chat's history. Use ONLY the evidence lines and the " +
          "long-term memory; if they don't contain the answer, say so briefly. Answer in the language " +
          "of the question, in 1-3 sentences." + (memory ? `\n\nLong-term memory:\n${memory}` : ""),
        history: [],
        userText: `Question: ${query}\n\nEvidence:\n${evidence}`,
        maxTokens: 512,
      },
      () => undefined,
    );
    if (answer.trim()) {
      await ctx.reply(`🧠 ${markdownToTelegramHtml(answer).slice(0, 3900)}`, {
        parse_mode: "HTML",
        message_thread_id: threadIdOf(ctx),
      });
    }
  } catch {
    /* lexical results already delivered */
  }
});
