import { Composer, type Context } from "grammy";
import { upsertChat } from "../db/repo.js";

/**
 * Channel support: as a channel admin the bot can post, edit and track posts.
 * NOTE: ctx.from does NOT exist on channel_post updates — never touch it here.
 */
export const channels = new Composer<Context>();

channels.on("channel_post", async (ctx, next) => {
  upsertChat(ctx.chat.id, "channel", ctx.chat.title, "administrator");
  await next();
});

// /ping in a channel — proof of life and posting rights.
channels.on("channel_post:text", async (ctx) => {
  if (ctx.channelPost.text.trim() === "/ping") {
    await ctx.api
      .editMessageText(ctx.chat.id, ctx.channelPost.message_id, "🏓 pong — SotongAssistant is active in this channel.")
      .catch(() => undefined);
  }
});
