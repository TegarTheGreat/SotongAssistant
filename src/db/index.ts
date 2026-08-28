import Database from "better-sqlite3";
import path from "node:path";
import { config } from "../config.js";

export const db = new Database(path.join(config.dataDir, "sotong.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS chats (
  chat_id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'member',    -- status bot di chat ini (member/administrator/left/kicked)
  rights TEXT,                              -- JSON hak admin bot
  settings TEXT NOT NULL DEFAULT '{}',      -- JSON pengaturan per chat
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS warns (
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
CREATE TABLE IF NOT EXISTS ai_memory (
  chat_key TEXT PRIMARY KEY,                -- chat_id atau chat_id:thread_id
  messages TEXT NOT NULL,                   -- JSON transcript bergulir
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_keys (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                       -- delete_message | kick_unverified
  payload TEXT NOT NULL,                    -- JSON
  due_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (due_at);
CREATE TABLE IF NOT EXISTS business_connections (
  connection_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  can_reply INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
`);

const now = () => Math.floor(Date.now() / 1000);

// ---------- pengaturan per chat ----------

export interface ChatSettings {
  welcome: boolean;
  welcomeText?: string;
  captcha: boolean;
  /** Batas warn sebelum eskalasi mute/ban. */
  warnLimit: number;
  ai: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiSystemPrompt?: string;
  /** Balas pertanyaan AI secara ephemeral (hanya penanya yang lihat) bila didukung. */
  aiEphemeral: boolean;
  antiChannelSpam: boolean;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  welcome: true,
  captcha: false,
  warnLimit: 3,
  ai: true,
  aiEphemeral: false,
  antiChannelSpam: false,
};

export function getSettings(chatId: number): ChatSettings {
  const row = db.prepare("SELECT settings FROM chats WHERE chat_id = ?").get(chatId) as
    | { settings: string }
    | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.settings) as Partial<ChatSettings>) };
}

export function updateSettings(chatId: number, patch: Partial<ChatSettings>): ChatSettings {
  const merged = { ...getSettings(chatId), ...patch };
  db.prepare(
    `INSERT INTO chats (chat_id, type, status, settings, updated_at) VALUES (?, 'unknown', 'member', ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`,
  ).run(chatId, JSON.stringify(merged), now());
  return merged;
}

export function upsertChat(chatId: number, type: string, title: string | undefined, status: string, rights?: unknown) {
  db.prepare(
    `INSERT INTO chats (chat_id, type, title, status, rights, settings, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?)
     ON CONFLICT(chat_id) DO UPDATE SET type = excluded.type, title = excluded.title,
       status = excluded.status, rights = COALESCE(excluded.rights, chats.rights), updated_at = excluded.updated_at`,
  ).run(chatId, type, title ?? null, status, rights ? JSON.stringify(rights) : null, now());
}

/** Migrasi group → supergroup: pindahkan semua data ke chat_id baru. */
export function migrateChatId(oldId: number, newId: number) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE OR REPLACE chats SET chat_id = ? WHERE chat_id = ?").run(newId, oldId);
    db.prepare("UPDATE OR REPLACE warns SET chat_id = ? WHERE chat_id = ?").run(newId, oldId);
  });
  tx();
}

// ---------- warns (operasi atomik, race-free) ----------

export function addWarn(chatId: number, userId: number): number {
  const row = db
    .prepare(
      `INSERT INTO warns (chat_id, user_id, count, updated_at) VALUES (?, ?, 1, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
       RETURNING count`,
    )
    .get(chatId, userId, now()) as { count: number };
  return row.count;
}

export function clearWarns(chatId: number, userId: number) {
  db.prepare("DELETE FROM warns WHERE chat_id = ? AND user_id = ?").run(chatId, userId);
}

// ---------- API key provider AI ----------

export function setProviderKey(provider: string, apiKey: string) {
  db.prepare(
    `INSERT INTO provider_keys (provider, api_key, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at`,
  ).run(provider, apiKey, now());
}

export function getProviderKey(provider: string): string | undefined {
  const row = db.prepare("SELECT api_key FROM provider_keys WHERE provider = ?").get(provider) as
    | { api_key: string }
    | undefined;
  return row?.api_key;
}

// ---------- memori percakapan AI ----------

export interface MemoryMessage {
  role: "user" | "assistant";
  name?: string;
  text: string;
}

export function getMemory(chatKey: string): MemoryMessage[] {
  const row = db.prepare("SELECT messages FROM ai_memory WHERE chat_key = ?").get(chatKey) as
    | { messages: string }
    | undefined;
  return row ? (JSON.parse(row.messages) as MemoryMessage[]) : [];
}

export function saveMemory(chatKey: string, messages: MemoryMessage[], cap = 20) {
  const trimmed = messages.slice(-cap);
  db.prepare(
    `INSERT INTO ai_memory (chat_key, messages, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(chat_key) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
  ).run(chatKey, JSON.stringify(trimmed), now());
}

export function clearMemory(chatKey: string) {
  db.prepare("DELETE FROM ai_memory WHERE chat_key = ?").run(chatKey);
}

// ---------- job terjadwal (tahan restart) ----------

export function scheduleJob(kind: string, payload: unknown, dueInSeconds: number) {
  db.prepare("INSERT INTO jobs (kind, payload, due_at) VALUES (?, ?, ?)").run(
    kind,
    JSON.stringify(payload),
    now() + dueInSeconds,
  );
}

export function takeDueJobs(): Array<{ id: number; kind: string; payload: string }> {
  const rows = db
    .prepare("SELECT id, kind, payload FROM jobs WHERE due_at <= ?")
    .all(now()) as Array<{ id: number; kind: string; payload: string }>;
  if (rows.length) {
    const del = db.prepare("DELETE FROM jobs WHERE id = ?");
    for (const r of rows) del.run(r.id);
  }
  return rows;
}

// ---------- business ----------

export function upsertBusinessConnection(id: string, userId: number, enabled: boolean, canReply: boolean) {
  db.prepare(
    `INSERT INTO business_connections (connection_id, user_id, enabled, can_reply, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(connection_id) DO UPDATE SET enabled = excluded.enabled, can_reply = excluded.can_reply, updated_at = excluded.updated_at`,
  ).run(id, userId, enabled ? 1 : 0, canReply ? 1 : 0, now());
}

export function getBusinessConnection(id: string) {
  return db
    .prepare("SELECT connection_id, user_id, enabled, can_reply FROM business_connections WHERE connection_id = ?")
    .get(id) as { connection_id: string; user_id: number; enabled: number; can_reply: number } | undefined;
}

export function listKnownChats() {
  return db
    .prepare("SELECT chat_id, type, title, status, rights FROM chats ORDER BY updated_at DESC LIMIT 50")
    .all() as Array<{ chat_id: number; type: string; title: string | null; status: string; rights: string | null }>;
}
