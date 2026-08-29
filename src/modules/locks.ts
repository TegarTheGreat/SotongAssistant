import { Composer, type Context } from "grammy";
import type { Message } from "grammy/types";
import { getSettings, updateSettings } from "../db/repo.js";
import { senderIsAdmin, isAdmin } from "../util/admin.js";
import { tc } from "../i18n/index.js";

/**
 * Rose-style content locks: admins pick media types regular members may not
 * send; locked content is deleted on sight.
 *   /lock stickers gifs · /unlock stickers · /locks
 * ( /unlock without arguments still ends a /lockdown — moderation.ts owns it.)
 */
export const locks = new Composer<Context>();

/** Detectors per lockable type. Order matters: a GIF also carries `document`. */
const DETECTORS: Record<string, (m: Message) => boolean> = {
  stickers: (m) => Boolean(m.sticker),
  gifs: (m) => Boolean(m.animation),
  photos: (m) => Boolean(m.photo),
  videos: (m) => Boolean(m.video || m.video_note),
  voice: (m) => Boolean(m.voice),
  audio: (m) => Boolean(m.audio),
  documents: (m) => Boolean(m.document && !m.animation),
  polls: (m) => Boolean(m.poll),
  games: (m) => Boolean(m.game),
  contacts: (m) => Boolean(m.contact),
  locations: (m) => Boolean(m.location || m.venue),
  forwards: (m) => Boolean(m.forward_origin),
};

export const LOCK_TYPES = Object.keys(DETECTORS);

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

function parseTypes(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^\//, ""))
    .filter((t) => t in DETECTORS);
}

locks.command("lock", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const types = parseTypes(ctx.match);
  if (!types.length) {
    await ctx.reply(tc(ctx, "lock.usage", { types: LOCK_TYPES.join(" ") }));
    return;
  }
  const current = new Set(getSettings(ctx.chat.id).locks ?? []);
  for (const t of types) current.add(t);
  updateSettings(ctx.chat.id, { locks: [...current] });
  await ctx.reply(tc(ctx, "lock.set", { types: [...current].join(", ") }));
});

/** Type-specific unlock; called from moderation.ts when /unlock has arguments. */
export async function unlockTypes(ctx: Context, input: string): Promise<boolean> {
  const types = parseTypes(input);
  if (!types.length) return false;
  const current = (getSettings(ctx.chat!.id).locks ?? []).filter((t) => !types.includes(t));
  updateSettings(ctx.chat!.id, { locks: current.length ? current : undefined });
  await ctx.reply(
    current.length ? tc(ctx, "lock.set", { types: current.join(", ") }) : tc(ctx, "lock.none"),
  );
  return true;
}

locks.command("locks", async (ctx) => {
  if (!isGroup(ctx)) return;
  const current = getSettings(ctx.chat.id).locks ?? [];
  await ctx.reply(
    current.length
      ? tc(ctx, "lock.set", { types: current.join(", ") })
      : tc(ctx, "lock.none") + "\n" + tc(ctx, "lock.usage", { types: LOCK_TYPES.join(" ") }),
  );
});

// Enforcement: delete locked content from non-admins; pass everything else on.
locks.on("message", async (ctx, next) => {
  if (!isGroup(ctx) || !ctx.from || ctx.from.is_bot || ctx.message.sender_chat) return next();
  const locked = getSettings(ctx.chat.id).locks;
  if (!locked?.length) return next();
  const hit = locked.some((t) => DETECTORS[t]?.(ctx.message));
  if (!hit) return next();
  if (await isAdmin(ctx, ctx.from.id)) return next();
  await ctx.deleteMessage().catch(() => undefined);
  // Deleted — downstream modules must not react to it.
});
