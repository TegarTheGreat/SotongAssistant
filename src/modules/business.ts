import { Composer, type Context } from "grammy";
import { config } from "../config.js";
import { getBusinessConnection, upsertBusinessConnection, getMemory, saveMemory } from "../db/repo.js";
import { getCatalog } from "../services/catalog.js";
import { streamCompletion } from "../services/ai/index.js";
import { markdownToTelegramHtml } from "../util/format.js";

/**
 * Telegram Business: a Premium user connects the bot via
 * Settings → Telegram Business → Chatbots; the bot then receives
 * business_connection + business_message updates and replies on their behalf.
 *
 * Abuse control: strangers drive these AI calls on the owner's API key, so
 * every peer is rate-limited and concurrency is capped per connection.
 */
export const business = new Composer<Context>();

const peerLastReply = new Map<string, number>();
const activeReplies = new Set<string>();
const PEER_COOLDOWN_MS = 15_000;
const MAX_MAP = 5_000;

business.on("business_connection", async (ctx) => {
  const conn = ctx.businessConnection;
  const canReply = Boolean(conn.rights?.can_reply);
  upsertBusinessConnection(conn.id, conn.user.id, conn.is_enabled, canReply);
  if (conn.is_enabled) {
    await ctx.api
      .sendMessage(
        conn.user.id,
        "🤝 Your business account is now connected to SotongAssistant." +
          (canReply
            ? " I'll help answer incoming chats with AI."
            : " Grant the 'reply to messages' permission so I can answer."),
      )
      .catch(() => undefined);
  }
});

business.on("business_message", async (ctx) => {
  const msg = ctx.businessMessage;
  const connId = msg.business_connection_id;
  if (!connId) return;
  const conn = getBusinessConnection(connId);
  if (!conn || !conn.enabled || !conn.can_reply) return;
  // Never answer the account owner's own outgoing messages.
  if (msg.from?.id === conn.user_id) return;
  const text = msg.text;
  if (!text) return;

  // Per-peer cooldown + one concurrent generation per connection.
  const peerKey = `${connId}:${msg.chat.id}`;
  if (Date.now() - (peerLastReply.get(peerKey) ?? 0) < PEER_COOLDOWN_MS) return;
  if (activeReplies.has(connId)) return;
  if (peerLastReply.size > MAX_MAP) peerLastReply.clear();
  peerLastReply.set(peerKey, Date.now());
  activeReplies.add(connId);

  try {
    const catalog = await getCatalog();
    const provider = catalog[config.defaultProvider];
    if (!provider) return;

    const memKey = `biz:${connId}:${msg.chat.id}`;
    const mem = getMemory(memKey);
    const reply = await streamCompletion(
      {
        provider,
        model: config.defaultModel,
        system:
          "You reply to incoming chats on behalf of a Telegram Business account owner. " +
          "Be polite and brief, note that the owner will follow up when needed, and " +
          "answer in the language of the person writing.",
        history: mem.messages,
        userText: text,
        userName: msg.from?.first_name,
      },
      () => undefined, // no streaming edits in business chats
    );
    await ctx.api.sendMessage(msg.chat.id, markdownToTelegramHtml(reply), {
      business_connection_id: connId,
      parse_mode: "HTML",
    });
    saveMemory(memKey, [
      ...mem.messages.slice(-18),
      { role: "user", name: msg.from?.first_name, text },
      { role: "assistant", text: reply },
    ]);
  } catch (err) {
    console.warn("business reply failed:", (err as Error).message);
  } finally {
    activeReplies.delete(connId);
  }
});
