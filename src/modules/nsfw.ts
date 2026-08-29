import { Composer, type Context } from "grammy";
import type { PhotoSize } from "grammy/types";
import { getSettings, addWarn, clearWarns } from "../db/repo.js";
import { classifyTelegramImage } from "../services/nsfw.js";
import { applyWarnAction } from "./moderation.js";
import { isAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * NSFW media gate (opt-in via /settings): photos, sticker thumbnails and
 * video/GIF thumbnails from non-admins are screened by the chat's multimodal
 * AI model. Confirmed NSFW → delete + warn (feeding the normal warn
 * escalation). Everything is throttled and fail-open, so a text-only model
 * or a missing key never blocks the group.
 */
export const nsfw = new Composer<Context>();

const checkWindow = new Map<number, number[]>(); // per-chat screening budget
const CHECKS_PER_MIN = 6;

/** Smallest thumbnail that is still classifiable (≥ ~200px when available). */
function pickPhoto(sizes: PhotoSize[]): PhotoSize | undefined {
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  return sorted.find((p) => p.width >= 200) ?? sorted[sorted.length - 1];
}

nsfw.on(["message:photo", "message:sticker", "message:video", "message:animation"], async (ctx, next) => {
  const chat = ctx.chat;
  if (chat.type !== "group" && chat.type !== "supergroup") return next();
  if (!ctx.from || ctx.from.is_bot || ctx.message.sender_chat) return next();
  if (!getSettings(chat.id).antiNsfw) return next();

  const msg = ctx.message;
  // Animated/video stickers have no still image the models can read — use the
  // static thumbnail Telegram generates for every kind.
  const target = msg.photo
    ? pickPhoto(msg.photo)
    : (msg.sticker?.thumbnail ?? msg.video?.thumbnail ?? msg.animation?.thumbnail);
  if (!target) return next();

  // Admins are exempt — checked first so they never consume the budget.
  if (await isAdmin(ctx, ctx.from.id)) return next();

  // Screening budget: never let one busy group burn the AI quota.
  const nowMs = Date.now();
  const hits = (checkWindow.get(chat.id) ?? []).filter((t) => nowMs - t < 60_000);
  if (hits.length >= CHECKS_PER_MIN) return next();
  hits.push(nowMs);
  checkWindow.set(chat.id, hits);

  const verdict = await classifyTelegramImage(ctx.api, chat.id, target.file_id, target.file_unique_id);
  if (verdict !== "nsfw") return next();

  await ctx.deleteMessage().catch(() => undefined);
  const count = addWarn(chat.id, ctx.from.id);
  const { warnLimit } = getSettings(chat.id);
  if (count >= warnLimit && (await applyWarnAction(ctx, chat.id, ctx.from.id))) {
    clearWarns(chat.id, ctx.from.id);
  }
  await ctx
    .reply(tc(ctx, "nsfw.removed", { name: escapeHtml(ctx.from.first_name), count, limit: warnLimit }), {
      parse_mode: "HTML",
    })
    .catch(() => undefined);
  // Deleted content is handled — nothing downstream should react to it.
});
