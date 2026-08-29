import { db, now } from "./index.js";
import { encryptSecret, decryptSecret } from "../services/security.js";
import type { ChatPermissions } from "grammy/types";

/** Typed repositories over the SQLite schema. Hot counters use atomic SQL. */

// ---------- per-chat settings ----------

export interface ChatSettings {
  language?: string;
  welcome: boolean;
  welcomeText?: string;
  captcha: boolean;
  warnLimit: number;
  ai: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiSystemPrompt?: string;
  /** Deliver AI answers as ephemeral messages only the asker can see (groups). */
  aiEphemeral: boolean;
  antiChannelSpam: boolean;
  antiflood: boolean;
  /** Log all group messages for context & /summarize (requires bot admin; explicit opt-in). */
  ambient: boolean;
  /** Auto-lockdown when a join spike (raid) is detected. */
  antiraid: boolean;
  rules?: string;
  /** Default permissions snapshot taken before /lockdown, used by /unlock. */
  lockSnapshot?: ChatPermissions;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  welcome: true,
  captcha: false,
  warnLimit: 3,
  ai: true,
  aiEphemeral: false,
  antiChannelSpam: false,
  antiflood: false,
  ambient: false,
  antiraid: false,
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

export function upsertChat(
  chatId: number,
  type: string,
  title: string | undefined,
  status: string,
  rights?: unknown,
) {
  db.prepare(
    `INSERT INTO chats (chat_id, type, title, status, rights, settings, updated_at) VALUES (?, ?, ?, ?, ?, '{}', ?)
     ON CONFLICT(chat_id) DO UPDATE SET type = excluded.type, title = excluded.title,
       status = excluded.status, rights = COALESCE(excluded.rights, chats.rights), updated_at = excluded.updated_at`,
  ).run(chatId, type, title ?? null, status, rights ? JSON.stringify(rights) : null, now());
}

/** Group→supergroup migration: move all keyed data to the new chat id. */
export function migrateChatId(oldId: number, newId: number) {
  db.transaction(() => {
    for (const table of ["chats", "warns", "notes", "message_log"]) {
      db.prepare(`UPDATE OR REPLACE ${table} SET chat_id = ? WHERE chat_id = ?`).run(newId, oldId);
    }
  })();
}

export function listKnownChats() {
  return db
    .prepare("SELECT chat_id, type, title, status, rights FROM chats ORDER BY updated_at DESC LIMIT 50")
    .all() as Array<{ chat_id: number; type: string; title: string | null; status: string; rights: string | null }>;
}

// ---------- warns (atomic, race-free across processes) ----------

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

export function getWarns(chatId: number, userId: number): number {
  const row = db.prepare("SELECT count FROM warns WHERE chat_id = ? AND user_id = ?").get(chatId, userId) as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

export function clearWarns(chatId: number, userId: number) {
  db.prepare("DELETE FROM warns WHERE chat_id = ? AND user_id = ?").run(chatId, userId);
}

// ---------- provider API keys (encrypted at rest) ----------

export function setProviderKey(provider: string, apiKey: string) {
  db.prepare(
    `INSERT INTO provider_keys (provider, api_key, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, updated_at = excluded.updated_at`,
  ).run(provider, encryptSecret(apiKey), now());
}

export function getProviderKey(provider: string): string | undefined {
  const row = db.prepare("SELECT api_key FROM provider_keys WHERE provider = ?").get(provider) as
    | { api_key: string }
    | undefined;
  return row ? decryptSecret(row.api_key) : undefined;
}

// ---------- AI conversation memory (short-term transcript + long-term summary) ----------

export interface MemoryMessage {
  role: "user" | "assistant";
  name?: string;
  text: string;
}

export interface ChatMemory {
  messages: MemoryMessage[];
  summary: string | null;
}

export function getMemory(chatKey: string): ChatMemory {
  const row = db.prepare("SELECT messages, summary FROM ai_memory WHERE chat_key = ?").get(chatKey) as
    | { messages: string; summary: string | null }
    | undefined;
  return row
    ? { messages: JSON.parse(row.messages) as MemoryMessage[], summary: row.summary }
    : { messages: [], summary: null };
}

export function saveMemory(chatKey: string, messages: MemoryMessage[], summary?: string | null) {
  db.prepare(
    `INSERT INTO ai_memory (chat_key, messages, summary, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_key) DO UPDATE SET messages = excluded.messages,
       summary = COALESCE(excluded.summary, ai_memory.summary), updated_at = excluded.updated_at`,
  ).run(chatKey, JSON.stringify(messages), summary ?? null, now());
}

export function clearMemory(chatKey: string) {
  db.prepare("DELETE FROM ai_memory WHERE chat_key = ?").run(chatKey);
}

// ---------- ambient message log (opt-in, bounded per chat) ----------

const LOG_CAP = 400;

export function logMessage(chatId: number, messageId: number, userId: number | undefined, name: string | undefined, text: string) {
  db.prepare(
    `INSERT OR REPLACE INTO message_log (chat_id, message_id, user_id, name, text, ts) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(chatId, messageId, userId ?? null, name ?? null, text.slice(0, 1000), now());
  db.prepare(
    `DELETE FROM message_log WHERE chat_id = ? AND message_id NOT IN
       (SELECT message_id FROM message_log WHERE chat_id = ? ORDER BY ts DESC LIMIT ?)`,
  ).run(chatId, chatId, LOG_CAP);
}

export function getLoggedMessage(chatId: number, messageId: number) {
  return db
    .prepare("SELECT user_id, name FROM message_log WHERE chat_id = ? AND message_id = ?")
    .get(chatId, messageId) as { user_id: number | null; name: string | null } | undefined;
}

export function recentMessages(chatId: number, limit = 150) {
  return db
    .prepare("SELECT name, text FROM message_log WHERE chat_id = ? ORDER BY ts DESC LIMIT ?")
    .all(chatId, limit)
    .reverse() as Array<{ name: string | null; text: string }>;
}

export function clearMessageLog(chatId: number) {
  db.prepare("DELETE FROM message_log WHERE chat_id = ?").run(chatId);
}

// ---------- notes ----------

export function saveNote(chatId: number, name: string, content: string) {
  db.prepare(
    `INSERT INTO notes (chat_id, name, content, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id, name) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
  ).run(chatId, name, content, now());
}

export function getNote(chatId: number, name: string): string | undefined {
  const row = db.prepare("SELECT content FROM notes WHERE chat_id = ? AND name = ?").get(chatId, name) as
    | { content: string }
    | undefined;
  return row?.content;
}

export function deleteNote(chatId: number, name: string): boolean {
  return db.prepare("DELETE FROM notes WHERE chat_id = ? AND name = ?").run(chatId, name).changes > 0;
}

export function listNotes(chatId: number): string[] {
  return (db.prepare("SELECT name FROM notes WHERE chat_id = ? ORDER BY name").all(chatId) as Array<{ name: string }>).map(
    (r) => r.name,
  );
}

// ---------- durable scheduled jobs (at-least-once) ----------

const JOB_MAX_ATTEMPTS = 3;

export function scheduleJob(kind: string, payload: unknown, dueInSeconds: number) {
  db.prepare("INSERT INTO jobs (kind, payload, due_at) VALUES (?, ?, ?)").run(
    kind,
    JSON.stringify(payload),
    now() + dueInSeconds,
  );
}

/**
 * Claim due jobs WITHOUT deleting them (at-least-once semantics): the runner
 * calls completeJob() after success, or retryJob() to reschedule. Jobs past
 * the attempt limit are dropped on claim.
 */
export function claimDueJobs(): Array<{ id: number; kind: string; payload: string; attempts: number }> {
  const rows = db
    .prepare("SELECT id, kind, payload, attempts FROM jobs WHERE due_at <= ?")
    .all(now()) as Array<{ id: number; kind: string; payload: string; attempts: number }>;
  const drop = db.prepare("DELETE FROM jobs WHERE id = ?");
  const bump = db.prepare("UPDATE jobs SET attempts = attempts + 1, due_at = ? WHERE id = ?");
  const claimed: typeof rows = [];
  for (const r of rows) {
    if (r.attempts >= JOB_MAX_ATTEMPTS) {
      drop.run(r.id);
      continue;
    }
    // Push due_at forward so a crashed run retries later instead of looping hot.
    bump.run(now() + 60, r.id);
    claimed.push(r);
  }
  return claimed;
}

export function completeJob(id: number) {
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

export function listJobsByKind(kind: string) {
  return db
    .prepare("SELECT id, payload, due_at FROM jobs WHERE kind = ? ORDER BY due_at")
    .all(kind) as Array<{ id: number; payload: string; due_at: number }>;
}

export function deleteJob(id: number): boolean {
  return db.prepare("DELETE FROM jobs WHERE id = ?").run(id).changes > 0;
}

// ---------- guard-bot join queries (Mini App captcha flow) ----------

export function savePendingJoinQuery(userId: number, chatId: number, queryId: string) {
  db.prepare(
    `INSERT INTO pending_join_queries (user_id, chat_id, query_id, ts) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, query_id = excluded.query_id, ts = excluded.ts`,
  ).run(userId, chatId, queryId, now());
  // Queries older than an hour are dead — keep the table tidy.
  db.prepare("DELETE FROM pending_join_queries WHERE ts < ?").run(now() - 3600);
}

/** Fetch and delete the pending query for a user (single-use). */
export function takePendingJoinQuery(userId: number) {
  const row = db
    .prepare("SELECT chat_id, query_id FROM pending_join_queries WHERE user_id = ?")
    .get(userId) as { chat_id: number; query_id: string } | undefined;
  if (row) db.prepare("DELETE FROM pending_join_queries WHERE user_id = ?").run(userId);
  return row;
}

// ---------- karma (atomic) ----------

export function addKarma(chatId: number, userId: number, name: string | undefined, delta: number): number {
  const row = db
    .prepare(
      `INSERT INTO karma (chat_id, user_id, name, score) VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET score = score + ?, name = COALESCE(excluded.name, karma.name)
       RETURNING score`,
    )
    .get(chatId, userId, name ?? null, delta, delta) as { score: number };
  return row.score;
}

export function topKarma(chatId: number, limit = 10) {
  return db
    .prepare("SELECT user_id, name, score FROM karma WHERE chat_id = ? ORDER BY score DESC LIMIT ?")
    .all(chatId, limit) as Array<{ user_id: number; name: string | null; score: number }>;
}

// ---------- business connections ----------

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
