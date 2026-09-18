import { Composer, type Context } from "grammy";
import type { ReactionTypeEmoji } from "grammy/types";
import { getSettings, updateSettings } from "../db/repo.js";
import { senderIsAdmin } from "../util/admin.js";
import { tc } from "../i18n/index.js";

/**
 * Reaction tooling:
 *  - /react <emoji>   (reply, admin) — the bot reacts to a message
 *  - /unreact         (reply, admin) — clears the bot's own reaction
 *  - /clearreactions  (reply, admin) — wipes EVERY reaction on a message,
 *    the cure for a brigaded post
 *  - /autoreact <emoji|off> — the bot reacts to every media post, the habit
 *    showcase and art groups want
 */
export const reactions = new Composer<Context>();

const autoReactWindow = new Map<number, number[]>(); // per-chat budget
const AUTO_REACT_PER_MIN = 12;

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

/** First emoji in the argument, if any (Telegram accepts a fixed set). */
function firstEmoji(input: string): string | undefined {
  return input.match(/\p{Extended_Pictographic}/u)?.[0];
}

reactions.command("react", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const target = ctx.message?.reply_to_message?.message_id;
  const emoji = firstEmoji(ctx.match);
  if (!target || !emoji) {
    await ctx.reply(tc(ctx, "react.usage"));
    return;
  }
  try {
    await ctx.api.setMessageReaction(ctx.chat.id, target, [
      { type: "emoji", emoji } as ReactionTypeEmoji,
    ]);
    await ctx.deleteMessage().catch(() => undefined);
  } catch (err) {
    // Telegram only accepts an allow-list of emoji for reactions.
    await ctx.reply(tc(ctx, "react.rejected", { reason: (err as Error).message.slice(0, 120) }));
  }
});

reactions.command("unreact", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const target = ctx.message?.reply_to_message?.message_id;
  if (!target) {
    await ctx.reply(tc(ctx, "react.usage"));
    return;
  }
  await ctx.api.setMessageReaction(ctx.chat.id, target, []).catch(() => undefined);
  await ctx.deleteMessage().catch(() => undefined);
});

// /clearreactions — remove everyone's reactions from the replied message.
// deleteAllMessageReactions is newer than grammY's typings, so it goes through
// the raw proxy; the bot's own reaction is cleared as a fallback.
reactions.command("clearreactions", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const target = ctx.message?.reply_to_message?.message_id;
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  const raw = ctx.api.raw as unknown as Record<string, (p: unknown) => Promise<unknown>>;
  try {
    await raw.deleteAllMessageReactions!({ chat_id: ctx.chat.id, message_id: target });
    await ctx.reply(tc(ctx, "react.cleared"));
  } catch {
    await ctx.api.setMessageReaction(ctx.chat.id, target, []).catch(() => undefined);
    await ctx.reply(tc(ctx, "react.clearFallback"));
  }
});

reactions.command("autoreact", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const arg = ctx.match.trim().toLowerCase();
  if (arg === "off") {
    updateSettings(ctx.chat.id, { autoReact: undefined });
    await ctx.reply(tc(ctx, "react.autoOff"));
    return;
  }
  const emoji = firstEmoji(ctx.match);
  if (!emoji) {
    await ctx.reply(tc(ctx, "react.autoUsage", { current: getSettings(ctx.chat.id).autoReact ?? "off" }));
    return;
  }
  updateSettings(ctx.chat.id, { autoReact: emoji });
  await ctx.reply(tc(ctx, "react.autoOn", { emoji }));
});

// The auto-reaction itself: media posts only, budgeted, never blocking.
reactions.on(["message:photo", "message:video", "message:animation", "message:document"], async (ctx, next) => {
  const emoji = isGroup(ctx) ? getSettings(ctx.chat.id).autoReact : undefined;
  if (!emoji || ctx.from?.is_bot) return next();

  const nowMs = Date.now();
  const hits = (autoReactWindow.get(ctx.chat.id) ?? []).filter((t) => nowMs - t < 60_000);
  if (hits.length >= AUTO_REACT_PER_MIN) return next();
  hits.push(nowMs);
  autoReactWindow.set(ctx.chat.id, hits);

  await ctx.api
    .setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: "emoji", emoji } as ReactionTypeEmoji])
    .catch(() => undefined); // rejected emoji or missing rights — stay quiet
  await next();
});
