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

/** Is the user an admin/creator of this chat? getChatAdministrators is cached for 5 minutes. */
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
 * Moderation-command guard: the sender must be an admin, or an anonymous admin
 * (sender_chat == the chat itself — the real user cannot be resolved for those).
 */
export async function senderIsAdmin(ctx: Context): Promise<boolean> {
  if (ctx.message?.sender_chat && ctx.message.sender_chat.id === ctx.chat?.id) return true;
  if (!ctx.from) return false;
  return isAdmin(ctx, ctx.from.id);
}

/** Moderation targets must never be an admin or the bot itself. */
export async function isProtectedTarget(ctx: Context, userId: number): Promise<boolean> {
  if (userId === ctx.me.id) return true;
  return isAdmin(ctx, userId);
}
