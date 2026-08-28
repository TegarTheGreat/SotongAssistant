import { Composer, type Context } from "grammy";
import { upsertChat } from "../db/index.js";

/**
 * Dukungan channel: bot sebagai admin channel bisa memposting,
 * mengedit, dan melacak postingan. ctx.from TIDAK ADA di channel_post —
 * jangan pernah menyentuhnya di handler channel.
 */
export const channels = new Composer<Context>();

channels.on("channel_post", async (ctx, next) => {
  upsertChat(ctx.chat.id, "channel", ctx.chat.title, "administrator");
  await next();
});

// /ping di channel — bukti bot hidup & punya hak posting
channels.on("channel_post:text", async (ctx) => {
  if (ctx.channelPost.text.trim() === "/ping") {
    await ctx.api.editMessageText(ctx.chat.id, ctx.channelPost.message_id, "🏓 pong — SotongAssistant aktif di channel ini.");
  }
});
