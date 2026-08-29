import Database from "better-sqlite3";
import path from "node:path";
import { config } from "../config.js";

/**
 * SQLite connection + schema. All queries live in ./repo.ts — this file only
 * owns the connection, pragmas, and idempotent migrations.
 */
export const db = new Database(path.join(config.dataDir, "sotong.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS chats (
  chat_id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'member',    -- bot's own status in this chat
  rights TEXT,                              -- JSON of the bot's admin rights
  settings TEXT NOT NULL DEFAULT '{}',      -- JSON per-chat settings
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
  chat_key TEXT PRIMARY KEY,                -- chat_id or chat_id:thread_id
  messages TEXT NOT NULL,                   -- JSON rolling transcript (short-term)
  summary TEXT,                             -- distilled long-term memory
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_keys (
  provider TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,                    -- AES-256-GCM encrypted at rest
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,                    -- JSON
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (due_at);
CREATE TABLE IF NOT EXISTS notes (
  chat_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, name)
);
CREATE TABLE IF NOT EXISTS message_log (
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  user_id INTEGER,
  name TEXT,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS message_log_ts ON message_log (chat_id, ts);
CREATE TABLE IF NOT EXISTS filters (
  chat_id INTEGER NOT NULL,
  trigger TEXT NOT NULL,                    -- lowercase keyword
  response TEXT NOT NULL,
  PRIMARY KEY (chat_id, trigger)
);
CREATE TABLE IF NOT EXISTS blocklist (
  chat_id INTEGER NOT NULL,
  word TEXT NOT NULL,                       -- lowercase
  PRIMARY KEY (chat_id, word)
);
CREATE TABLE IF NOT EXISTS afk (
  user_id INTEGER PRIMARY KEY,
  reason TEXT,
  since INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS federations (
  fed_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fed_chats (
  chat_id INTEGER PRIMARY KEY,              -- a chat belongs to at most one federation
  fed_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fed_bans (
  fed_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT,
  ts INTEGER NOT NULL,
  PRIMARY KEY (fed_id, user_id)
);
CREATE TABLE IF NOT EXISTS pending_join_queries (
  user_id INTEGER PRIMARY KEY,              -- one pending guard-bot query per user
  chat_id INTEGER NOT NULL,
  query_id TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS karma (
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);
CREATE TABLE IF NOT EXISTS business_connections (
  connection_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  can_reply INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
`);

// Idempotent column migrations for databases created by earlier versions.
for (const stmt of [
  "ALTER TABLE ai_memory ADD COLUMN summary TEXT",
  "ALTER TABLE jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(stmt);
  } catch {
    /* column already exists */
  }
}

export const now = () => Math.floor(Date.now() / 1000);

/** Flush the WAL into the main database file (used before /export backups). */
export function checkpoint(): void {
  db.pragma("wal_checkpoint(TRUNCATE)");
}
