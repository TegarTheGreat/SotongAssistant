import { mkdirSync } from "node:fs";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Konfigurasi kurang: env ${name} belum disetel. Lihat .env.example`);
    process.exit(1);
  }
  return v;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  ownerId: Number(process.env.OWNER_ID ?? 0),
  dataDir: process.env.DATA_DIR ?? path.resolve("data"),
  /** Default AI bila chat belum memilih model sendiri. */
  defaultProvider: process.env.DEFAULT_AI_PROVIDER ?? "anthropic",
  defaultModel: process.env.DEFAULT_AI_MODEL ?? "claude-opus-5",
};

mkdirSync(config.dataDir, { recursive: true });
