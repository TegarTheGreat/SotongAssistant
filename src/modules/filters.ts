import { Composer, type Context } from "grammy";
import {
  saveFilter,
  deleteFilter,
  listFilters,
  addBlockedWord,
  removeBlockedWord,
  listBlockedWords,
  getSettings,
} from "../db/repo.js";
import { senderIsAdmin, isAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Message hygiene & auto-replies:
 *  - filters: keyword → canned reply (classic community-bot staple)
 *  - blocklist: banned words are deleted on sight (non-admins)
 *  - antilink: t.me invite links from non-admins are deleted (toggle)
 */
export const filters = new Composer<Context>();

const INVITE_LINK_RE = /(?:t\.me\/(?:joinchat\/|\+)|t\.me\/[a-zA-Z]\w{3,})/i;

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

// ---------- admin commands ----------

filters.command("filter", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const [trigger, ...rest] = ctx.match.trim().split(/\s+/);
  const response = rest.join(" ") || ctx.message?.reply_to_message?.text;
  if (!trigger || !response) {
    await ctx.reply(tc(ctx, "filter.usage"));
    return;
  }
  saveFilter(ctx.chat.id, trigger.toLowerCase(), response);
  await ctx.reply(tc(ctx, "filter.saved", { trigger: escapeHtml(trigger.toLowerCase()) }), {
    parse_mode: "HTML",
  });
});

filters.command("unfilter", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const trigger = ctx.match.trim().toLowerCase();
  const ok = trigger && deleteFilter(ctx.chat.id, trigger);
  await ctx.reply(tc(ctx, ok ? "filter.deleted" : "filter.usage", { trigger: escapeHtml(trigger) }), {
    parse_mode: "HTML",
  });
});

filters.command("filters", async (ctx) => {
  if (!isGroup(ctx)) return;
  const all = listFilters(ctx.chat.id);
  if (!all.length) {
    await ctx.reply(tc(ctx, "filter.empty"));
    return;
  }
  await ctx.reply(
    tc(ctx, "filter.list", { triggers: all.map((f) => `<code>${escapeHtml(f.trigger)}</code>`).join(" ") }),
    { parse_mode: "HTML" },
  );
});

filters.command("block", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const word = ctx.match.trim().toLowerCase();
  if (!word) {
    await ctx.reply(tc(ctx, "block.usage"));
    return;
  }
  addBlockedWord(ctx.chat.id, word);
  await ctx.reply(tc(ctx, "block.added", { word: escapeHtml(word) }), { parse_mode: "HTML" });
});

filters.command("unblock", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const word = ctx.match.trim().toLowerCase();
  const ok = word && removeBlockedWord(ctx.chat.id, word);
  await ctx.reply(tc(ctx, ok ? "block.removed" : "block.usage", { word: escapeHtml(word) }), {
    parse_mode: "HTML",
  });
});

filters.command("blocklist", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const words = listBlockedWords(ctx.chat.id);
  if (!words.length) {
    await ctx.reply(tc(ctx, "block.empty"));
    return;
  }
  await ctx.reply(tc(ctx, "block.list", { words: words.map((w) => `<code>${escapeHtml(w)}</code>`).join(" ") }), {
    parse_mode: "HTML",
  });
});

// ---------- enforcement + auto-replies (must pass through to later modules) ----------

filters.on("message:text", async (ctx, next) => {
  if (!isGroup(ctx) || !ctx.from || ctx.from.is_bot || ctx.message.sender_chat) return next();
  const text = ctx.message.text;
  const lower = text.toLowerCase();
  const chatId = ctx.chat.id;
  const settings = getSettings(chatId);

  if (!lower.startsWith("/")) {
    const blocked = listBlockedWords(chatId);
    // Only pay for the (cached) admin lookup when something is enforceable.
    const hit =
      (settings.antilink && INVITE_LINK_RE.test(text)) ||
      (blocked.length > 0 && blocked.some((w) => lower.includes(w)));
    if (hit && !(await isAdmin(ctx, ctx.from.id))) {
      await ctx.deleteMessage().catch(() => undefined);
      return;
    }
  }

  // Keyword filters: whole-word match against the saved triggers.
  if (!lower.startsWith("/")) {
    for (const f of listFilters(chatId)) {
      const re = new RegExp(`(^|\\W)${f.trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\W)`, "i");
      if (re.test(lower)) {
        await ctx.reply(escapeHtml(f.response), {
          parse_mode: "HTML",
          message_thread_id: threadIdOf(ctx),
          reply_parameters: { message_id: ctx.message.message_id },
        });
        break; // one filter reply per message keeps chats tidy
      }
    }
  }
  await next();
});
