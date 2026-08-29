import { Composer, type Context } from "grammy";
import { getSettings, scheduleJob } from "../db/repo.js";
import { humanDuration } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * Video chat / live stream awareness.
 *
 * The Bot API exposes NO method to start, join or manage a video chat — only
 * four service messages a bot may observe (video_chat_scheduled / _started /
 * _ended / _participants_invited). This module turns those into something
 * useful: an announcement when a call starts, an automatic reminder for a
 * scheduled one, and a duration recap when it ends.
 *
 * Opt-in per chat via /settings ("Video chat announcements").
 */
export const videochat = new Composer<Context>();

/** Remind the group 5 minutes before a scheduled call (when far enough out). */
const REMINDER_LEAD_S = 300;

videochat.on("message:video_chat_scheduled", async (ctx, next) => {
  if (!getSettings(ctx.chat.id).videoChatNotify) return next();
  const startDate = ctx.message.video_chat_scheduled.start_date;
  const secondsAway = startDate - Math.floor(Date.now() / 1000);
  const when = new Date(startDate * 1000).toISOString().replace("T", " ").slice(0, 16);
  await ctx.reply(tc(ctx, "vc.scheduled", { when }), { parse_mode: "HTML" }).catch(() => undefined);
  if (secondsAway > REMINDER_LEAD_S + 60) {
    scheduleJob(
      "say",
      { chatId: ctx.chat.id, text: tc(ctx, "vc.soon") },
      secondsAway - REMINDER_LEAD_S,
    );
  }
  await next();
});

videochat.on("message:video_chat_started", async (ctx, next) => {
  if (!getSettings(ctx.chat.id).videoChatNotify) return next();
  const msg = await ctx.reply(tc(ctx, "vc.started"), { parse_mode: "HTML" }).catch(() => undefined);
  // Pin it so latecomers see the call is live; silently ignored without rights.
  if (msg) {
    await ctx.api
      .pinChatMessage(ctx.chat.id, msg.message_id, { disable_notification: true })
      .catch(() => undefined);
  }
  await next();
});

videochat.on("message:video_chat_ended", async (ctx, next) => {
  if (!getSettings(ctx.chat.id).videoChatNotify) return next();
  await ctx
    .reply(tc(ctx, "vc.ended", { duration: humanDuration(Math.max(60, ctx.message.video_chat_ended.duration)) }), {
      parse_mode: "HTML",
    })
    .catch(() => undefined);
  // The "live" pin is stale now — clear it.
  await ctx.api.unpinChatMessage(ctx.chat.id).catch(() => undefined);
  await next();
});
