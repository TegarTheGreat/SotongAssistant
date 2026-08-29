import { Composer, type Context } from "grammy";
import { setAfk, clearAfk, getAfk } from "../db/repo.js";
import { escapeHtml, humanDuration } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * AFK status: /afk [reason] marks you away; replying to (or text-mentioning)
 * an AFK member posts a gentle notice; your next message clears the status.
 */
export const afk = new Composer<Context>();

const noticeThrottle = new Map<number, number>(); // per AFK user, avoid spam

afk.command("afk", async (ctx) => {
  if (!ctx.from) return;
  setAfk(ctx.from.id, ctx.match.trim() || undefined);
  await ctx.reply(tc(ctx, "afk.on", { name: escapeHtml(ctx.from.first_name) }), {
    parse_mode: "HTML",
    message_thread_id: threadIdOf(ctx),
  });
});

afk.on("message", async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return next();

  // Coming back: any non-/afk message clears the status.
  if (!ctx.message?.text?.startsWith("/afk") && clearAfk(from.id)) {
    await ctx
      .reply(tc(ctx, "afk.off", { name: escapeHtml(from.first_name) }), {
        parse_mode: "HTML",
        message_thread_id: threadIdOf(ctx),
      })
      .catch(() => undefined);
  }

  // Replying to an AFK member → notice (throttled to once per minute per user).
  const target = ctx.message?.reply_to_message?.from;
  if (target && !target.is_bot && target.id !== from.id) {
    const away = getAfk(target.id);
    if (away && Date.now() - (noticeThrottle.get(target.id) ?? 0) > 60_000) {
      noticeThrottle.set(target.id, Date.now());
      const reason = away.reason ? ` — ${escapeHtml(away.reason)}` : "";
      const since = humanDuration(Math.max(60, Math.floor(Date.now() / 1000) - away.since));
      await ctx
        .reply(tc(ctx, "afk.notice", { name: escapeHtml(target.first_name), reason, since }), {
          parse_mode: "HTML",
          message_thread_id: threadIdOf(ctx),
        })
        .catch(() => undefined);
    }
  }
  await next();
});
