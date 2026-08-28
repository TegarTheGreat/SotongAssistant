import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "./config.js";
import { manager } from "./modules/manager.js";
import { settings } from "./modules/settings.js";
import { moderation } from "./modules/moderation.js";
import { onboarding } from "./modules/onboarding.js";
import { channels } from "./modules/channels.js";
import { business } from "./modules/business.js";
import { ai } from "./modules/ai.js";
import { startJobRunner } from "./services/jobs.js";

const bot = new Bot(config.botToken);

// Urutan penting: manajemen chat → pengaturan → moderasi → onboarding → channel → business → AI (paling terakhir,
// karena handler message:text-nya menyerap pesan yang ditujukan ke bot).
bot.use(manager);
bot.use(settings);
bot.use(moderation);
bot.use(onboarding);
bot.use(channels);
bot.use(business);
bot.use(ai);

// Tanpa bot.catch, satu handler yang throw (mis. 403 saat user memblokir bot) mematikan proses.
bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error(`Telegram error ${e.error_code} di update ${err.ctx.update.update_id}: ${e.description}`);
  } else if (e instanceof HttpError) {
    console.error("Gagal menghubungi Telegram:", e);
  } else {
    console.error("Error tak terduga:", e);
  }
});

async function main() {
  // Identitas & command menu per scope — idempoten, aman dijalankan tiap boot.
  await bot.api.setMyCommands(
    [
      { command: "ask", description: "Tanya AI" },
      { command: "aimodel", description: "Pilih provider & model AI" },
      { command: "settings", description: "Pengaturan grup" },
      { command: "id", description: "Tampilkan chat/user id" },
    ],
    { scope: { type: "all_group_chats" } },
  );
  await bot.api.setMyCommands(
    [
      { command: "settings", description: "Pengaturan grup" },
      { command: "warn", description: "(reply) Beri peringatan" },
      { command: "mute", description: "(reply) Bisukan — /mute 1h" },
      { command: "unmute", description: "(reply) Buka bisu" },
      { command: "ban", description: "(reply) Ban + hapus semua pesannya" },
      { command: "unban", description: "Unban user" },
      { command: "kick", description: "(reply) Keluarkan" },
      { command: "purge", description: "(reply) Hapus s.d. pesan ini" },
      { command: "pin", description: "(reply) Pin pesan" },
      { command: "welcome", description: "Setel pesan welcome" },
      { command: "aiprompt", description: "Setel system prompt AI" },
    ],
    { scope: { type: "all_chat_administrators" } },
  );
  await bot.api.setMyCommands(
    [
      { command: "start", description: "Tentang bot ini" },
      { command: "ask", description: "Tanya AI" },
      { command: "aimodel", description: "Pilih provider & model AI" },
      { command: "setkey", description: "(owner) Setel API key provider" },
      { command: "status", description: "(owner) Daftar chat" },
      { command: "forget", description: "Hapus memori percakapan" },
    ],
    { scope: { type: "all_private_chats" } },
  );

  const stopJobs = startJobRunner(bot.api);

  // Graceful shutdown — polling meng-ACK batch terakhir sehingga restart bersih.
  process.once("SIGINT", () => {
    stopJobs();
    void bot.stop();
  });
  process.once("SIGTERM", () => {
    stopJobs();
    void bot.stop();
  });

  // allowed_updates HARUS eksplisit: chat_member, message_reaction, dkk.
  // TIDAK dikirim Telegram bila tidak diminta — handler join/reaction mati sunyi tanpa ini.
  await bot.start({
    allowed_updates: [
      "message",
      "edited_message",
      "channel_post",
      "callback_query",
      "inline_query",
      "my_chat_member",
      "chat_member",
      "chat_join_request",
      "message_reaction",
      "business_connection",
      "business_message",
      "poll",
      "poll_answer",
    ],
    drop_pending_updates: true,
    onStart: (me) => console.log(`🦑 SotongAssistant berjalan sebagai @${me.username}`),
  });
}

void main();
