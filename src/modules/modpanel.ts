import { Composer, InlineKeyboard, type Context } from "grammy";
import { addWarn, clearWarns, getSettings } from "../db/repo.js";
import { applyWarnAction } from "./moderation.js";
import { senderIsAdmin, isAdmin, isProtectedTarget } from "../util/admin.js";
import { MUTED_PERMISSIONS } from "../util/permissions.js";
import { escapeHtml } from "../util/format.js";
import { tc, langOf, t } from "../i18n/index.js";
import { replyEphemeral } from "../services/telegram.js";

/**
 * One-tap moderation panel: reply to an offending message with /mp and get an
 * inline keyboard (warn / mute / kick / ban / delete). The panel is delivered
 * as an ephemeral message, so the group never sees the controls.
 * Callback data stays index-free and tiny: mp:<action>:<userId>:<msgId>.
 */
export const modpanel = new Composer<Context>();

const ACTIONS = ["warn", "mute1h", "mute1d", "kick", "ban", "del"] as const;
type Action = (typeof ACTIONS)[number];

modpanel.command("mp", async (ctx) => {
  if (ctx.chat.type === "private") return;
  if (!(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const replied = ctx.message?.reply_to_message;
  const target = replied?.from;
  if (!replied || !target || target.is_bot) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  if (await isProtectedTarget(ctx, target.id)) {
    await ctx.reply(tc(ctx, "error.targetProtected"));
    return;
  }
  const lang = langOf(ctx);
  const tail = `${target.id}:${replied.message_id}`;
  const kb = new InlineKeyboard()
    .text(t(lang, "mp.warn"), `mp:warn:${tail}`)
    .text(t(lang, "mp.mute1h"), `mp:mute1h:${tail}`)
    .text(t(lang, "mp.mute1d"), `mp:mute1d:${tail}`)
    .row()
    .text(t(lang, "mp.kick"), `mp:kick:${tail}`)
    .text(t(lang, "mp.ban"), `mp:ban:${tail}`)
    .text(t(lang, "mp.del"), `mp:del:${tail}`);
  await ctx.deleteMessage().catch(() => undefined);
  await replyEphemeral(ctx, t(lang, "mp.title", { name: escapeHtml(target.first_name) }), kb);
});

modpanel.callbackQuery(/^mp:(\w+):(-?\d+):(\d+)$/, async (ctx) => {
  const action = ctx.match[1]!;
  const userIdRaw = ctx.match[2]!;
  const msgIdRaw = ctx.match[3]!;
  const chatId = ctx.chat?.id;
  if (!chatId || !ACTIONS.includes(action as Action)) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!(await isAdmin(ctx, ctx.from.id))) {
    await ctx.answerCallbackQuery({ text: tc(ctx, "error.adminOnly"), show_alert: true });
    return;
  }
  const userId = Number(userIdRaw);
  const msgId = Number(msgIdRaw);
  if (await isProtectedTarget(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: tc(ctx, "error.targetProtected"), show_alert: true });
    return;
  }
  const lang = langOf(ctx);
  try {
    switch (action as Action) {
      case "warn": {
        const limit = getSettings(chatId).warnLimit;
        const count = addWarn(chatId, userId);
        if (count >= limit) {
          // Same escalation as /warn: the configured warn mode, counter reset.
          if (await applyWarnAction(ctx, chatId, userId)) clearWarns(chatId, userId);
        }
        break;
      }
      case "mute1h":
      case "mute1d":
        await ctx.api.restrictChatMember(chatId, userId, MUTED_PERMISSIONS, {
          until_date: Math.floor(Date.now() / 1000) + (action === "mute1h" ? 3600 : 24 * 3600),
        });
        break;
      case "kick":
        await ctx.api.banChatMember(chatId, userId);
        await ctx.api.unbanChatMember(chatId, userId, { only_if_banned: true });
        break;
      case "ban":
        await ctx.api.banChatMember(chatId, userId);
        break;
      case "del":
        await ctx.api.deleteMessage(chatId, msgId);
        break;
    }
    await ctx.answerCallbackQuery({ text: t(lang, "mp.done", { action }) });
    // The panel did its job — retire it so buttons cannot be tapped twice.
    await ctx.editMessageText(t(lang, "mp.done", { action })).catch(() => undefined);
  } catch (err) {
    await ctx.answerCallbackQuery({
      text: t(lang, "error.generic", { reason: (err as Error).message.slice(0, 150) }),
      show_alert: true,
    });
  }
});
