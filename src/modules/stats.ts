import { Composer, type Context } from "grammy";
import { getSettings, messageStats, allLoggedMessages } from "../db/repo.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Activity analytics on top of the ambient message log (explicit opt-in):
 *  - /stats — 24h/7d counters, a per-day bar chart, most active members
 *  - /recall <words> — lexical search over recent messages ("who said that?")
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

// /recall — cheap lexical retrieval: score = shared tokens, recency as tiebreak.
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
  const scored = allLoggedMessages(ctx.chat.id)
    .map((m) => {
      const hay = m.text.toLowerCase();
      const score = terms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0);
      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || b.ts - a.ts)
    .slice(0, 5);
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
});
