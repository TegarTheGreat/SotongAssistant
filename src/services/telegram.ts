import type { Api, Context } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";

/**
 * Forum-safe thread id: replies in non-forum supergroups also carry
 * message_thread_id (the reply chain root), which Telegram REJECTS as a
 * thread target. Only forward it when the message is a real topic message.
 */
export function threadIdOf(ctx: Context): number | undefined {
  return ctx.message?.is_topic_message ? ctx.message.message_thread_id : undefined;
}

/**
 * Try to send a message only its receiver can see (ephemeral messages,
 * Bot API 10.2+). Falls back to a regular reply on servers/clients where
 * the feature is not available, so callers never need to care.
 */
export async function replyEphemeral(
  ctx: Context,
  html: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId) return;
  if (userId && ctx.chat?.type !== "private") {
    try {
      await ctx.api.raw.sendMessage({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        reply_markup: keyboard,
        ephemeral_message_parameters: { receiver_user_id: userId },
        // Typings may trail the live Bot API; the wire accepts the field.
      } as never);
      return;
    } catch {
      /* fall through to a normal reply */
    }
  }
  await ctx.reply(html, { parse_mode: "HTML", message_thread_id: threadIdOf(ctx), reply_markup: keyboard });
}

/** Send with a single retry honoring 429 retry_after. */
export async function sendSafe(api: Api, chatId: number, text: string, other?: Parameters<Api["sendMessage"]>[2]) {
  try {
    return await api.sendMessage(chatId, text, other);
  } catch (err) {
    const retryAfter = (err as { parameters?: { retry_after?: number } }).parameters?.retry_after;
    if (retryAfter) {
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      return await api.sendMessage(chatId, text, other);
    }
    throw err;
  }
}
