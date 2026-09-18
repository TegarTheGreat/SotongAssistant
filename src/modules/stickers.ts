import { Composer, type Context } from "grammy";
import type { InputSticker } from "grammy/types";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * Sticker tools: /kang clones the replied sticker (or photo) into a personal
 * pack owned by the requester and hosted by this bot.
 *
 * Telegram requires every bot-made pack name to end with `_by_<botusername>`,
 * and each pack belongs to one user, so every member gets their own
 * "SotongAssistant pack".
 */
export const stickers = new Composer<Context>();

/** Deterministic, Telegram-legal pack name for a user (letters/digits/_ only). */
function packName(userId: number, botUsername: string, kind: "static" | "video" | "animated"): string {
  const suffix = kind === "static" ? "" : `_${kind}`;
  return `sotong_${userId}${suffix}_by_${botUsername}`;
}

stickers.command("kang", async (ctx) => {
  const user = ctx.from;
  const replied = ctx.message?.reply_to_message;
  if (!user || !replied) {
    await ctx.reply(tc(ctx, "kang.usage"));
    return;
  }

  // Figure out what we are cloning and which pack kind it belongs to.
  let fileId: string | undefined;
  let format: "static" | "animated" | "video" = "static";
  if (replied.sticker) {
    fileId = replied.sticker.file_id;
    format = replied.sticker.is_animated ? "animated" : replied.sticker.is_video ? "video" : "static";
  } else if (replied.photo?.length) {
    // Telegram converts a photo into a static sticker automatically.
    fileId = replied.photo[replied.photo.length - 1]!.file_id;
  }
  if (!fileId) {
    await ctx.reply(tc(ctx, "kang.usage"));
    return;
  }

  // Emoji: the argument, or the source sticker's own emoji, or a default.
  const emoji = ctx.match.trim().match(/\p{Extended_Pictographic}/gu)?.slice(0, 3) ?? [];
  const emojiList = emoji.length ? emoji : [replied.sticker?.emoji ?? "🦑"];

  const name = packName(user.id, ctx.me.username, format);
  const title = `${user.first_name.slice(0, 40)} · SotongAssistant`;
  const sticker: InputSticker = { sticker: fileId, format, emoji_list: emojiList };

  try {
    // Fast path: the pack already exists.
    await ctx.api.addStickerToSet(user.id, name, sticker);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/STICKERSET_INVALID|not found/i.test(msg)) {
      try {
        await ctx.api.createNewStickerSet(user.id, name, title, [sticker]);
      } catch (createErr) {
        // The most common cause is the user never having messaged the bot.
        await ctx.reply(tc(ctx, "kang.failed", { reason: escapeHtml((createErr as Error).message.slice(0, 150)) }), {
          parse_mode: "HTML",
        });
        return;
      }
    } else {
      await ctx.reply(tc(ctx, "kang.failed", { reason: escapeHtml(msg.slice(0, 150)) }), { parse_mode: "HTML" });
      return;
    }
  }

  await ctx.reply(tc(ctx, "kang.done", { emoji: emojiList.join(""), link: `https://t.me/addstickers/${name}` }), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
});

// /mypack — the link to the requester's own pack(s).
stickers.command("mypack", async (ctx) => {
  if (!ctx.from) return;
  const links = (["static", "video", "animated"] as const)
    .map((k) => packName(ctx.from!.id, ctx.me.username, k))
    .map((n) => `https://t.me/addstickers/${n}`);
  await ctx.reply(tc(ctx, "kang.mypack", { links: links.join("\n") }), {
    link_preview_options: { is_disabled: true },
  });
});
