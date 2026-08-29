import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { Bot, GrammyError, HttpError, webhookCallback } from "grammy";
import type { LanguageCode } from "grammy/types";
import { config } from "./config.js";
import { manager } from "./modules/manager.js";
import { settings } from "./modules/settings.js";
import { moderation } from "./modules/moderation.js";
import { antiflood } from "./modules/antiflood.js";
import { onboarding } from "./modules/onboarding.js";
import { notes } from "./modules/notes.js";
import { fun } from "./modules/fun.js";
import { stars } from "./modules/stars.js";
import { karma } from "./modules/karma.js";
import { announce } from "./modules/announce.js";
import { channels } from "./modules/channels.js";
import { business } from "./modules/business.js";
import { ai } from "./modules/ai.js";
import { startJobRunner } from "./services/jobs.js";

const bot = new Bot(config.botToken);

// Order matters: anti-flood filters first; AI goes last because its
// message:text handler consumes messages addressed to the bot.
bot.use(manager);
bot.use(antiflood);
bot.use(settings);
bot.use(moderation);
bot.use(onboarding);
bot.use(notes);
bot.use(fun);
bot.use(stars);
bot.use(karma);
bot.use(announce);
bot.use(channels);
bot.use(business);
bot.use(ai);

// Without bot.catch, one throwing handler (e.g. a 403 after a user blocks the
// bot) would kill the whole process.
bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error(`Telegram error ${e.error_code} on update ${err.ctx.update.update_id}: ${e.description}`);
  } else if (e instanceof HttpError) {
    console.error("Could not reach Telegram:", e);
  } else {
    console.error("Unexpected error:", e);
  }
});

/** Per-scope command menus; localized descriptions for the largest locales. */
async function registerCommands() {
  const groupCommands = [
    { command: "ask", description: "Ask the AI" },
    { command: "summarize", description: "Summarize recent messages" },
    { command: "karma", description: "Karma leaderboard" },
    { command: "rules", description: "Show group rules" },
    { command: "notes", description: "List saved notes" },
    { command: "report", description: "Call the admins" },
    { command: "settings", description: "Group settings" },
    { command: "id", description: "Show chat/user id" },
  ];
  const adminCommands = [
    { command: "settings", description: "Group settings" },
    { command: "warn", description: "(reply) Warn a user" },
    { command: "mute", description: "(reply) Mute — /mute 1h" },
    { command: "unmute", description: "(reply) Unmute" },
    { command: "ban", description: "(reply) Ban + wipe messages" },
    { command: "unban", description: "Unban a user" },
    { command: "kick", description: "(reply) Kick" },
    { command: "purge", description: "(reply) Bulk delete" },
    { command: "pin", description: "(reply) Pin message" },
    { command: "lockdown", description: "Freeze the group" },
    { command: "unlock", description: "Unfreeze the group" },
    { command: "welcome", description: "Set welcome text" },
    { command: "setrules", description: "Set group rules" },
    { command: "announce", description: "Recurring announcement" },
    { command: "announcements", description: "List announcements" },
    { command: "aimodel", description: "Pick AI provider & model" },
    { command: "aiprompt", description: "Set AI personality" },
    { command: "lang", description: "Change language" },
  ];
  const privateCommands = [
    { command: "start", description: "About this bot" },
    { command: "help", description: "Everything I can do" },
    { command: "ask", description: "Ask the AI" },
    { command: "aimodel", description: "Pick AI provider & model" },
    { command: "setkey", description: "(owner) Set a provider API key" },
    { command: "status", description: "(owner) List managed chats" },
    { command: "broadcast", description: "(owner) Message all chats" },
    { command: "memory", description: "Show long-term memory" },
    { command: "forget", description: "Wipe chat memory" },
    { command: "donate", description: "Support via Telegram Stars" },
  ];
  await bot.api.setMyCommands(groupCommands, { scope: { type: "all_group_chats" } });
  await bot.api.setMyCommands(adminCommands, { scope: { type: "all_chat_administrators" } });
  await bot.api.setMyCommands(privateCommands, { scope: { type: "all_private_chats" } });

  // Localized menus for the biggest Telegram locales (fallback stays English).
  const localized: Record<string, [string, string, string]> = {
    id: ["Tanya AI", "Pengaturan grup", "Semua kemampuanku"],
    ru: ["Спросить ИИ", "Настройки группы", "Все возможности"],
    es: ["Preguntar a la IA", "Ajustes del grupo", "Todo lo que hago"],
    pt: ["Perguntar à IA", "Configurações do grupo", "Tudo o que faço"],
  };
  for (const [lang, [askDesc, settingsDesc, helpDesc]] of Object.entries(localized)) {
    await bot.api
      .setMyCommands(
        [
          { command: "ask", description: askDesc },
          { command: "settings", description: settingsDesc },
          { command: "help", description: helpDesc },
        ],
        { scope: { type: "all_group_chats" }, language_code: lang as LanguageCode },
      )
      .catch(() => undefined);
  }
}

// allowed_updates MUST be explicit: chat_member, message_reaction and the
// business updates are never delivered unless requested here.
const ALLOWED_UPDATES = [
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
  "pre_checkout_query",
  "poll",
  "poll_answer",
] as const;

async function main() {
  await registerCommands();
  const stopJobs = startJobRunner(bot.api);

  if (config.webhookUrl) {
    // Webhook mode — supports multiple replicas behind a load balancer.
    // The secret must be identical on every replica, so when WEBHOOK_SECRET
    // is not provided it is derived deterministically from the bot token.
    const secret =
      config.webhookSecret ?? createHash("sha256").update(`${config.botToken}:webhook`).digest("hex");
    await bot.api.setWebhook(config.webhookUrl, {
      secret_token: secret,
      allowed_updates: [...ALLOWED_UPDATES],
      drop_pending_updates: true,
    });
    await bot.init();
    const handle = webhookCallback(bot, "http", { secretToken: secret });
    const server = createServer((req, res) => {
      if (req.method === "POST") {
        handle(req, res).catch((err: unknown) => {
          console.error("webhook error:", err);
          if (!res.headersSent) res.writeHead(200);
          res.end();
        });
      } else {
        // Health endpoint for load balancers / uptime checks.
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
      }
    });
    server.listen(config.port, () =>
      console.log(`🦑 SotongAssistant webhook listening on :${config.port} as @${bot.botInfo.username}`),
    );
    const shutdown = () => {
      stopJobs();
      server.close();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return;
  }

  // Long-polling mode (default) — exactly ONE instance per bot token.
  // Graceful shutdown ACKs the last batch, so restarts never re-process
  // updates that were already answered.
  process.once("SIGINT", () => {
    stopJobs();
    void bot.stop();
  });
  process.once("SIGTERM", () => {
    stopJobs();
    void bot.stop();
  });
  await bot.start({
    allowed_updates: [...ALLOWED_UPDATES],
    drop_pending_updates: true,
    onStart: (me) => console.log(`🦑 SotongAssistant is running as @${me.username}`),
  });
}

void main();
