import { Composer, type Context } from "grammy";
import { getSettings } from "../db/repo.js";
import { isAdmin } from "../util/admin.js";
import { escapeHtml, humanDuration } from "../util/format.js";
import { MUTED_PERMISSIONS } from "../util/permissions.js";
import { tc } from "../i18n/index.js";

/**
 * Sliding-window anti-flood: more than LIMIT messages within WINDOW seconds
 * gets an automatic timed mute. Opt-in per chat via /settings.
 */
export const antiflood = new Composer<Context>();

const WINDOW_MS = 10_000;
const LIMIT = 8;
const MUTE_SECONDS = 10 * 60;

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

antiflood.on("message", async (ctx, next) => {
  const chat = ctx.chat;
  const from = ctx.from;
  if (
    !chat ||
    (chat.type !== "group" && chat.type !== "supergroup") ||
    !from ||
    from.is_bot ||
    ctx.message?.sender_chat // anonymous admins / channels are handled elsewhere
  ) {
    return next();
  }
  const settings = getSettings(chat.id);
  if (!settings.antiflood) return next();

  const key = `${chat.id}:${from.id}`;
  const nowMs = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  hits.push(nowMs);
  buckets.set(key, hits);

  // Periodic sweep keeps the map bounded on long uptimes.
  if (nowMs - lastSweep > 60_000) {
    lastSweep = nowMs;
    for (const [k, v] of buckets) {
      if (v.every((t) => nowMs - t >= WINDOW_MS)) buckets.delete(k);
    }
  }

  if (hits.length > LIMIT && !(await isAdmin(ctx, from.id))) {
    buckets.delete(key);
    try {
      await ctx.api.restrictChatMember(chat.id, from.id, MUTED_PERMISSIONS, {
        until_date: Math.floor(nowMs / 1000) + MUTE_SECONDS,
      });
      await ctx.reply(
        tc(ctx, "flood.muted", {
          name: escapeHtml(from.first_name),
          duration: humanDuration(MUTE_SECONDS),
        }),
        { parse_mode: "HTML" },
      );
    } catch {
      /* missing rights — stay silent, the settings toggle hints at requirements */
    }
    return;
  }
  await next();
});
