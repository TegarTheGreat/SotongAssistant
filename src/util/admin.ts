import type { Context } from "grammy";

interface CacheEntry {
  ids: Set<number>;
  at: number;
}

const cache = new Map<number, CacheEntry>();
const TTL_MS = 5 * 60_000;

export function invalidateAdminCache(chatId: number) {
  cache.delete(chatId);
}

/** Apakah user admin/creator di chat ini? Hasil getChatAdministrators di-cache 5 menit. */
export async function isAdmin(ctx: Context, userId: number): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (!chatId) return false;
  let entry = cache.get(chatId);
  if (!entry || Date.now() - entry.at > TTL_MS) {
    const admins = await ctx.api.getChatAdministrators(chatId);
    entry = { ids: new Set(admins.map((a) => a.user.id)), at: Date.now() };
    cache.set(chatId, entry);
  }
  return entry.ids.has(userId);
}

/**
 * Guard perintah moderasi: pengirim harus admin, atau admin anonim
 * (sender_chat == chat itu sendiri — user asli tak bisa di-resolve).
 */
export async function senderIsAdmin(ctx: Context): Promise<boolean> {
  if (ctx.message?.sender_chat && ctx.message.sender_chat.id === ctx.chat?.id) return true;
  if (!ctx.from) return false;
  return isAdmin(ctx, ctx.from.id);
}

/** Target moderasi tidak boleh admin, bot sendiri, atau persona channel. */
export async function isProtectedTarget(ctx: Context, userId: number): Promise<boolean> {
  if (userId === ctx.me.id) return true;
  return isAdmin(ctx, userId);
}
