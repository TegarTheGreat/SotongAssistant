import { Composer, type Context } from "grammy";
import { addKarma, topKarma, getLoggedMessage, getSettings } from "../db/repo.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Reaction-based karma: reacting 👍/❤️/🔥… to someone's message gives them a
 * point, 👎/💩… takes one. Requires the ambient message log (the /settings
 * "read all messages" toggle) to resolve message → author, and message_reaction
 * updates require the bot to be an admin.
 */
export const karma = new Composer<Context>();

const POSITIVE = new Set(["👍", "❤", "🔥", "🎉", "🥰", "👏", "💯", "🏆", "🤩", "⚡"]);
const NEGATIVE = new Set(["👎", "💩", "🤮", "🤬"]);

function emojiSet(reactions: Array<{ type: string; emoji?: string }>): Set<string> {
  const set = new Set<string>();
  for (const r of reactions) if (r.type === "emoji" && r.emoji) set.add(r.emoji);
  return set;
}

karma.on("message_reaction", async (ctx) => {
  const upd = ctx.messageReaction;
  const chat = upd.chat;
  if (chat.type !== "group" && chat.type !== "supergroup") return;
  if (!getSettings(chat.id).ambient) return; // author lookup needs the log
  const reactor = upd.user;
  if (!reactor || reactor.is_bot) return;

  const author = getLoggedMessage(chat.id, upd.message_id);
  if (!author?.user_id || author.user_id === reactor.id) return; // no self-karma

  const oldSet = emojiSet(upd.old_reaction as never);
  const newSet = emojiSet(upd.new_reaction as never);
  let delta = 0;
  for (const e of newSet) {
    if (oldSet.has(e)) continue; // only newly added reactions count
    if (POSITIVE.has(e)) delta += 1;
    else if (NEGATIVE.has(e)) delta -= 1;
  }
  if (delta !== 0) addKarma(chat.id, author.user_id, author.name ?? undefined, delta);
});

karma.command("karma", async (ctx) => {
  if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;
  const rows = topKarma(ctx.chat.id);
  if (!rows.length) {
    await ctx.reply(tc(ctx, "karma.empty"), { message_thread_id: threadIdOf(ctx) });
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const list = rows
    .map((r, i) => `${medals[i] ?? "▫️"} ${escapeHtml(r.name ?? String(r.user_id))} — <b>${r.score}</b>`)
    .join("\n");
  await ctx.reply(tc(ctx, "karma.title", { rows: list }), {
    parse_mode: "HTML",
    message_thread_id: threadIdOf(ctx),
  });
});
