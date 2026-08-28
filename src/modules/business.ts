import { Composer, type Context } from "grammy";
import { config } from "../config.js";
import {
  getBusinessConnection,
  upsertBusinessConnection,
  getMemory,
  saveMemory,
} from "../db/index.js";
import { getCatalog } from "../services/catalog.js";
import { streamCompletion } from "../services/ai/index.js";
import { markdownToTelegramHtml } from "../util/format.js";

/**
 * Telegram Business: user Premium menghubungkan bot lewat
 * Settings → Telegram Business → Chatbots. Bot lalu menerima
 * business_connection + business_message dan bisa membalas atas nama user.
 */
export const business = new Composer<Context>();

business.on("business_connection", async (ctx) => {
  const conn = ctx.businessConnection;
  const canReply = Boolean(conn.rights?.can_reply);
  upsertBusinessConnection(conn.id, conn.user.id, conn.is_enabled, canReply);
  if (conn.is_enabled) {
    await ctx.api
      .sendMessage(
        conn.user.id,
        "🤝 Akun business kamu terhubung ke SotongAssistant." +
          (canReply
            ? " Aku akan membantu membalas chat masuk dengan AI."
            : " Beri izin 'reply to messages' agar aku bisa membalas."),
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
  // jangan balas pesan yang dikirim si pemilik akun sendiri
  if (msg.from?.id === conn.user_id) return;
  const text = msg.text;
  if (!text) return;

  const catalog = await getCatalog();
  const provider = catalog[config.defaultProvider];
  if (!provider) return;

  const memKey = `biz:${connId}:${msg.chat.id}`;
  const history = getMemory(memKey);
  try {
    const reply = await streamCompletion(
      {
        provider,
        model: config.defaultModel,
        system:
          "Kamu adalah asisten yang membalas chat masuk atas nama pemilik akun Telegram Business. " +
          "Balas sopan, ringkas, dan beri tahu bahwa pemilik akan menindaklanjuti bila perlu. " +
          "Gunakan bahasa lawan bicara.",
        history,
        userText: text,
        userName: msg.from?.first_name,
      },
      () => undefined, // tanpa streaming edit di business chat
    );
    await ctx.api.sendMessage(msg.chat.id, markdownToTelegramHtml(reply), {
      business_connection_id: connId,
      parse_mode: "HTML",
    });
    saveMemory(memKey, [
      ...history,
      { role: "user", name: msg.from?.first_name, text },
      { role: "assistant", text: reply },
    ]);
  } catch (err) {
    console.warn("business reply gagal:", (err as Error).message);
  }
});
