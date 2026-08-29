import { Composer, InlineKeyboard, type Context } from "grammy";
import { upsertChat, getSettings } from "../db/repo.js";
import { tc } from "../i18n/index.js";

/**
 * Channel support: as a channel admin the bot can post, edit and track posts.
 * NOTE: ctx.from does NOT exist on channel_post updates — never touch it here.
 */
export const channels = new Composer<Context>();

// Discussion-group companion: when the linked channel's post is auto-forwarded
// into the group and the autopin toggle is on, pin it (quietly).
channels.on("message", async (ctx, next) => {
  if (
    ctx.message.is_automatic_forward &&
    (ctx.chat.type === "group" || ctx.chat.type === "supergroup") &&
    getSettings(ctx.chat.id).autoPinChannelPosts
  ) {
    await ctx.api
      .pinChatMessage(ctx.chat.id, ctx.message.message_id, { disable_notification: true })
      .catch(() => undefined); // missing can_pin_messages — stay silent
  }
  await next();
});

channels.on("channel_post", async (ctx, next) => {
  upsertChat(ctx.chat.id, "channel", ctx.chat.title, "administrator");
  await next();
});

/**
 * Suggested posts (channels): subscribers can submit a post for review. The
 * bot surfaces each submission to channel admins with one-tap approve/decline
 * buttons, so moderation never leaves Telegram.
 */
channels.on(["message", "channel_post"], async (ctx, next) => {
  // A submission can surface either as a channel post or in the channel's
  // linked direct-messages chat, so both update kinds are handled here.
  const msg = ctx.msg;
  const info = msg?.suggested_post_info;
  if (!msg || !info) return next();
  const kb = new InlineKeyboard()
    .text(tc(ctx, "sp.approve"), `sp:ok:${msg.message_id}`)
    .text(tc(ctx, "sp.decline"), `sp:no:${msg.message_id}`);
  await ctx.api
    .sendMessage(ctx.chat.id, tc(ctx, "sp.pending", { price: info.price?.amount ?? 0 }), {
      parse_mode: "HTML",
      reply_parameters: { message_id: msg.message_id },
      reply_markup: kb,
    })
    .catch(() => undefined);
  await next();
});

channels.callbackQuery(/^sp:(ok|no):(\d+)$/, async (ctx) => {
  const decision = ctx.match[1];
  const messageId = Number(ctx.match[2]);
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  try {
    if (decision === "ok") await ctx.api.approveSuggestedPost(chatId, messageId);
    else await ctx.api.declineSuggestedPost(chatId, messageId, { comment: "Declined by an admin" });
    await ctx.editMessageText(tc(ctx, decision === "ok" ? "sp.approved" : "sp.declined"));
    await ctx.answerCallbackQuery();
  } catch (err) {
    await ctx.answerCallbackQuery({
      text: (err as Error).message.slice(0, 180),
      show_alert: true,
    });
  }
});

// /ping in a channel — proof of life and posting rights.
channels.on("channel_post:text", async (ctx) => {
  if (ctx.channelPost.text.trim() === "/ping") {
    await ctx.api
      .editMessageText(ctx.chat.id, ctx.channelPost.message_id, "🏓 pong — SotongAssistant is active in this channel.")
      .catch(() => undefined);
  }
});
