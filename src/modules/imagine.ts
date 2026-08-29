import { Composer, InputFile, type Context } from "grammy";
import { getSettings, getAiUsageToday, bumpAiUsage } from "../db/repo.js";
import { generateImage } from "../services/imagegen.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/** /imagine <prompt> — AI image generation, delivered as a photo. */
export const imagine = new Composer<Context>();

const userLast = new Map<number, number>();
const COOLDOWN_MS = 60_000; // image generations are the priciest call we make

imagine.command("imagine", async (ctx) => {
  const prompt = ctx.match.trim();
  if (!prompt) {
    await ctx.reply(tc(ctx, "img.usage"));
    return;
  }
  const chat = ctx.chat;
  const isGroup = chat.type === "group" || chat.type === "supergroup";
  const settings = getSettings(chat.id);
  if (isGroup && !settings.ai) {
    await ctx.reply(tc(ctx, "ai.disabled"));
    return;
  }
  const uid = ctx.from?.id ?? 0;
  if (Date.now() - (userLast.get(uid) ?? 0) < COOLDOWN_MS) {
    await ctx.react("🥱").catch(() => undefined);
    return;
  }
  // Image generation is the priciest AI call, so it counts against the same
  // /aiquota daily cap as text answers (read-only check; bumped after success).
  if (isGroup && settings.aiDailyLimit && getAiUsageToday(chat.id) >= settings.aiDailyLimit) {
    await ctx.reply(tc(ctx, "ai.quotaReached", { limit: settings.aiDailyLimit }));
    return;
  }
  userLast.set(uid, Date.now());
  if (userLast.size > 5000) userLast.clear();

  await ctx.api.sendChatAction(chat.id, "upload_photo", { message_thread_id: threadIdOf(ctx) }).catch(() => undefined);
  try {
    const image = await generateImage(prompt);
    if (!image) {
      await ctx.reply(tc(ctx, "img.noProvider"));
      return;
    }
    if (isGroup && settings.aiDailyLimit) bumpAiUsage(chat.id);
    await ctx.replyWithPhoto(new InputFile(image, "imagine.png"), {
      caption: `🎨 ${prompt.slice(0, 900)}`,
      message_thread_id: threadIdOf(ctx),
    });
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message.slice(0, 200) }));
  }
});
