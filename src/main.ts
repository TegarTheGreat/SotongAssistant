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
import { commands } from "./modules/commands.js";
import { topics } from "./modules/topics.js";
import { locks } from "./modules/locks.js";
import { schedule } from "./modules/schedule.js";
import { nsfw } from "./modules/nsfw.js";
import { filters } from "./modules/filters.js";
import { afk } from "./modules/afk.js";
import { utility } from "./modules/utility.js";
import { translate } from "./modules/translate.js";
import { stats } from "./modules/stats.js";
import { federation } from "./modules/federation.js";
import { modpanel } from "./modules/modpanel.js";
import { inline } from "./modules/inline.js";
import { imagine } from "./modules/imagine.js";
import { ai } from "./modules/ai.js";
import { startJobRunner } from "./services/jobs.js";
import { handleWebAppRequest } from "./services/webapp.js";
import { startAutoUpdater } from "./services/updater.js";

const bot = new Bot(config.botToken);

// Order matters: the command gate (/disable) runs first so a disabled command
// never reaches its module; anti-flood next; federation BEFORE onboarding so
// fed-banned joiners are removed before any welcome/captcha; nsfw & filters
// (blocklist/antilink) before notes & fun so deleted messages trigger nothing
// else; AI goes last because its message:text handler consumes messages
// addressed to the bot.
bot.use(commands);
bot.use(manager);
bot.use(antiflood);
bot.use(federation);
bot.use(settings);
bot.use(moderation);
bot.use(modpanel);
bot.use(topics);
bot.use(onboarding);
bot.use(locks);
bot.use(nsfw);
bot.use(filters);
bot.use(schedule);
bot.use(notes);
bot.use(fun);
bot.use(stars);
bot.use(karma);
bot.use(announce);
bot.use(channels);
bot.use(business);
bot.use(utility);
bot.use(afk);
bot.use(translate);
bot.use(stats);
bot.use(inline);
bot.use(imagine);
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
    { command: "imagine", description: "AI image from a prompt" },
    { command: "summarize", description: "Summarize recent messages" },
    { command: "stats", description: "Group activity stats" },
    { command: "recall", description: "Search recent messages" },
    { command: "karma", description: "Karma leaderboard" },
    { command: "rules", description: "Show group rules" },
    { command: "notes", description: "List saved notes" },
    { command: "afk", description: "Mark yourself away" },
    { command: "tr", description: "(reply) Translate a message" },
    { command: "transcribe", description: "(reply) Voice → text" },
    { command: "report", description: "Call the admins" },
    { command: "admins", description: "List the admins" },
    { command: "settings", description: "Group settings" },
    { command: "ping", description: "Bot latency" },
    { command: "about", description: "Version & info" },
    { command: "id", description: "Show chat/user id" },
  ];
  const adminCommands = [
    { command: "settings", description: "Group settings" },
    { command: "mp", description: "(reply) Moderation panel" },
    { command: "warn", description: "(reply) Warn a user" },
    { command: "warnmode", description: "Warn penalty: mute|kick|ban" },
    { command: "mute", description: "(reply) Mute — /mute 1h" },
    { command: "unmute", description: "(reply) Unmute" },
    { command: "ban", description: "(reply) Ban + wipe messages" },
    { command: "unban", description: "Unban a user" },
    { command: "kick", description: "(reply) Kick" },
    { command: "promote", description: "(reply) Make admin" },
    { command: "demote", description: "(reply) Remove admin" },
    { command: "title", description: "(reply) Custom admin title" },
    { command: "purge", description: "(reply) Bulk delete" },
    { command: "pin", description: "(reply) Pin message" },
    { command: "del", description: "(reply) Delete a message" },
    { command: "lockdown", description: "Freeze the group" },
    { command: "unlock", description: "Unfreeze / unlock types" },
    { command: "lock", description: "Lock media types" },
    { command: "locks", description: "List content locks" },
    { command: "night", description: "Nightly auto-lockdown window" },
    { command: "settz", description: "Set the chat timezone" },
    { command: "schedule", description: "One-off timed message" },
    { command: "unote", description: "(reply) Note about a user" },
    { command: "antilink", description: "Link filter: off|invites|all" },
    { command: "allowlink", description: "Allowlist a domain" },
    { command: "filter", description: "Auto-reply: /filter hi Hello!" },
    { command: "filters", description: "List auto-replies" },
    { command: "block", description: "Block a word" },
    { command: "blocklist", description: "List blocked words" },
    { command: "disable", description: "Disable a command here" },
    { command: "enable", description: "Re-enable a command" },
    { command: "disabled", description: "List disabled commands" },
    { command: "tagall", description: "Mention active members" },
    { command: "approve", description: "(reply) Trust a user" },
    { command: "aiquota", description: "Daily AI answer cap" },
    { command: "bridge", description: "Auto-translate the group" },
    { command: "welcome", description: "Set welcome text" },
    { command: "goodbye", description: "Set farewell text" },
    { command: "setrules", description: "Set group rules" },
    { command: "invite", description: "Create an invite link" },
    { command: "newtopic", description: "(forum) Create a topic" },
    { command: "closetopic", description: "(forum) Close this topic" },
    { command: "announce", description: "Recurring announcement" },
    { command: "announcements", description: "List announcements" },
    { command: "digest", description: "Toggle recurring AI digest" },
    { command: "joinfed", description: "Join a ban federation" },
    { command: "fedinfo", description: "Federation status" },
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
    { command: "export", description: "(owner) Backup the database" },
    { command: "import", description: "(owner) Restore a backup" },
    { command: "update", description: "(owner) Self-update from git" },
    { command: "newfed", description: "Create a ban federation" },
    { command: "memory", description: "Show long-term memory" },
    { command: "forget", description: "Wipe chat memory" },
    { command: "about", description: "Version & info" },
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
  // Requires "inline feedback" in BotFather; carries inline_message_id for
  // the inline-mode AI answers.
  "chosen_inline_result",
  "my_chat_member",
  "chat_member",
  "chat_join_request",
  "message_reaction",
  "business_connection",
  "business_message",
  "pre_checkout_query",
  "poll",
  "poll_answer",
  // Newer update kinds (Bot API 10.3) that typings may not know yet — the
  // wire accepts them; casts below keep the compiler satisfied.
  "stopped_message_generation",
] as unknown as ReadonlyArray<
  NonNullable<NonNullable<Parameters<InstanceType<typeof Bot>["start"]>[0]>["allowed_updates"]>[number]
>;

async function main() {
  await registerCommands();
  const stopJobs = startJobRunner(bot.api);
  // Hourly git update check: applies automatically with AUTO_UPDATE=true,
  // otherwise notifies the owner. No-op outside a git checkout.
  const stopUpdater = startAutoUpdater(bot.api);

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
      void (async () => {
        // Mini App captcha routes are served from the same HTTP server.
        if (await handleWebAppRequest(req, res, bot.api)) return;
        if (req.method === "POST") {
          await handle(req, res).catch((err: unknown) => {
            console.error("webhook error:", err);
            if (!res.headersSent) res.writeHead(200);
            res.end();
          });
        } else {
          // Health endpoint for load balancers / uptime checks.
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("ok");
        }
      })();
    });
    server.listen(config.port, () =>
      console.log(`🦑 SotongAssistant webhook listening on :${config.port} as @${bot.botInfo.username}`),
    );
    const shutdown = () => {
      stopJobs();
      stopUpdater();
      server.close();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return;
  }

  // Long-polling mode (default) — exactly ONE instance per bot token.
  // When WEBAPP_URL is set, the Mini App captcha server runs alongside polling.
  let webappServer: ReturnType<typeof createServer> | undefined;
  if (config.webappUrl) {
    webappServer = createServer((req, res) => {
      void handleWebAppRequest(req, res, bot.api).then((handled) => {
        if (!handled) {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("ok");
        }
      });
    });
    webappServer.listen(config.port, () =>
      console.log(`🦑 Mini App captcha server listening on :${config.port}`),
    );
  }
  // Graceful shutdown ACKs the last batch, so restarts never re-process
  // updates that were already answered.
  process.once("SIGINT", () => {
    stopJobs();
    stopUpdater();
    webappServer?.close();
    void bot.stop();
  });
  process.once("SIGTERM", () => {
    stopJobs();
    stopUpdater();
    webappServer?.close();
    void bot.stop();
  });
  await bot.start({
    allowed_updates: [...ALLOWED_UPDATES],
    drop_pending_updates: true,
    onStart: (me) => console.log(`🦑 SotongAssistant is running as @${me.username}`),
  });
}

void main();
