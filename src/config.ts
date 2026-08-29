import { mkdirSync } from "node:fs";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing configuration: env ${name} is not set. See .env.example`);
    process.exit(1);
  }
  return v;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  ownerId: Number(process.env.OWNER_ID ?? 0),
  dataDir: process.env.DATA_DIR ?? path.resolve("data"),
  /** Default AI model when a chat has not picked its own. */
  defaultProvider: process.env.DEFAULT_AI_PROVIDER ?? "anthropic",
  defaultModel: process.env.DEFAULT_AI_MODEL ?? "claude-opus-5",
  /**
   * Webhook mode: set WEBHOOK_URL (public HTTPS URL Telegram will POST to)
   * to switch from long polling — required for multiple replicas.
   */
  webhookUrl: process.env.WEBHOOK_URL,
  port: Number(process.env.PORT ?? 8080),
  webhookSecret: process.env.WEBHOOK_SECRET,
  /**
   * Public HTTPS base URL of this bot's HTTP server (e.g. https://bot.example.com).
   * Enables the self-hosted Mini App captcha for guard-bot join requests; the
   * HTTP server starts even in polling mode when this is set.
   */
  webappUrl: process.env.WEBAPP_URL?.replace(/\/$/, ""),
  /** Optional shared secret required by the /metrics endpoint (?token=…). */
  metricsToken: process.env.METRICS_TOKEN,
  /** Apply git updates automatically (hourly check); otherwise just notify the owner. */
  autoUpdate: process.env.AUTO_UPDATE === "true",
};

mkdirSync(config.dataDir, { recursive: true });
