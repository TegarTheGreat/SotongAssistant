import { db, now } from "./index.js";
import { encryptSecret, decryptSecret } from "../services/security.js";
import type { ChatPermissions } from "grammy/types";

/** Typed repositories over the SQLite schema. Hot counters use atomic SQL. */

// ---------- per-chat settings ----------

export interface ChatSettings {
  language?: string;
  welcome: boolean;
  welcomeText?: string;
  /** Farewell message when a member leaves (off by default — most groups skip it). */
  goodbye: boolean;
  goodbyeText?: string;
  captcha: boolean;
  warnLimit: number;
  /** What happens when the warn limit is reached (Rose-style warn mode). */
  warnAction: "mute" | "kick" | "ban";
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
  /** Delete Telegram invite links posted by non-admins. */
  antilink: boolean;
  /** "invites" (default) deletes t.me invites only; "all" deletes every URL. */
  antilinkMode: "invites" | "all";
  /** Domains exempt from the "all" link filter (suffix match). */
  linkAllowlist?: string[];
  /** Commands non-admins may not use here (Rose-style /disable). */
  disabledCommands?: string[];
  /** Media types non-admins may not send (Rose-style /lock stickers gifs …). */
  locks?: string[];
  /** Max AI answers per UTC day for this chat (undefined = unlimited). */
  aiDailyLimit?: number;
  /** AI screening of photos/video thumbnails for NSFW content (opt-in). */
  antiNsfw: boolean;
  /** Pin the linked channel's auto-forwarded posts in the discussion group. */
  autoPinChannelPosts: boolean;
  /** Announce video chats / live streams starting, ending and scheduled. */
  videoChatNotify: boolean;
  /** Emoji the bot auto-reacts with on media posts (undefined = off). */
  autoReact?: string;
  /** IANA timezone for night mode and time displays (e.g. Asia/Jakarta). */
  timezone?: string;
  /** Daily lockdown window in chat-local time, e.g. { start: "23:00", end: "06:00" }. */
  night?: { start: string; end: string };
  /** Whether night mode is currently holding the group locked (runner-managed). */
  nightActive?: boolean;
  /** Permissions snapshot taken when night mode locks (separate from /lockdown). */
  nightSnapshot?: ChatPermissions;
  /** Auto-translation bridge target language (undefined = off). */
  autoTranslate?: string;
  rules?: string;
  /** Default permissions snapshot taken before /lockdown, used by /unlock. */
  lockSnapshot?: ChatPermissions;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  welcome: true,
  goodbye: false,
  captcha: false,
  warnLimit: 3,
  warnAction: "mute",
  ai: true,
  aiEphemeral: false,
  antiChannelSpam: false,
  antiflood: false,
  ambient: false,
  antiraid: false,
  antilink: false,
  antilinkMode: "invites",
  antiNsfw: false,
  autoPinChannelPosts: false,
  videoChatNotify: false,
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

/** Row count of a known table (dashboard metrics only; name is whitelisted). */
export function countRows(table: "notes" | "filters" | "karma" | "approvals" | "business_leads"): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
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

// ---------- filters (auto-reply triggers) ----------

export function saveFilter(chatId: number, trigger: string, response: string) {
  db.prepare(
    `INSERT INTO filters (chat_id, trigger, response) VALUES (?, ?, ?)
     ON CONFLICT(chat_id, trigger) DO UPDATE SET response = excluded.response`,
  ).run(chatId, trigger, response);
}

export function deleteFilter(chatId: number, trigger: string): boolean {
  return db.prepare("DELETE FROM filters WHERE chat_id = ? AND trigger = ?").run(chatId, trigger).changes > 0;
}

export function listFilters(chatId: number) {
  return db
    .prepare("SELECT trigger, response FROM filters WHERE chat_id = ? ORDER BY trigger")
    .all(chatId) as Array<{ trigger: string; response: string }>;
}

// ---------- blocklist (banned words) ----------

export function addBlockedWord(chatId: number, word: string) {
  db.prepare("INSERT OR IGNORE INTO blocklist (chat_id, word) VALUES (?, ?)").run(chatId, word);
}

export function removeBlockedWord(chatId: number, word: string): boolean {
  return db.prepare("DELETE FROM blocklist WHERE chat_id = ? AND word = ?").run(chatId, word).changes > 0;
}

export function listBlockedWords(chatId: number): string[] {
  return (db.prepare("SELECT word FROM blocklist WHERE chat_id = ? ORDER BY word").all(chatId) as Array<{ word: string }>).map(
    (r) => r.word,
  );
}

// ---------- AFK ----------

export function setAfk(userId: number, reason: string | undefined) {
  db.prepare(
    `INSERT INTO afk (user_id, reason, since) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET reason = excluded.reason, since = excluded.since`,
  ).run(userId, reason ?? null, now());
}

export function clearAfk(userId: number): boolean {
  return db.prepare("DELETE FROM afk WHERE user_id = ?").run(userId).changes > 0;
}

export function getAfk(userId: number) {
  return db.prepare("SELECT reason, since FROM afk WHERE user_id = ?").get(userId) as
    | { reason: string | null; since: number }
    | undefined;
}

// ---------- federations (cross-group ban lists) ----------

export function createFederation(fedId: string, name: string, ownerId: number) {
  db.prepare("INSERT INTO federations (fed_id, name, owner_id, created_at) VALUES (?, ?, ?, ?)").run(
    fedId,
    name,
    ownerId,
    now(),
  );
}

export function getFederation(fedId: string) {
  return db.prepare("SELECT fed_id, name, owner_id FROM federations WHERE fed_id = ?").get(fedId) as
    | { fed_id: string; name: string; owner_id: number }
    | undefined;
}

export function joinFederation(fedId: string, chatId: number) {
  db.prepare(
    `INSERT INTO fed_chats (chat_id, fed_id) VALUES (?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET fed_id = excluded.fed_id`,
  ).run(chatId, fedId);
}

export function leaveFederation(chatId: number): boolean {
  return db.prepare("DELETE FROM fed_chats WHERE chat_id = ?").run(chatId).changes > 0;
}

export function fedOfChat(chatId: number) {
  return db
    .prepare(
      `SELECT f.fed_id, f.name, f.owner_id FROM fed_chats c JOIN federations f ON f.fed_id = c.fed_id
       WHERE c.chat_id = ?`,
    )
    .get(chatId) as { fed_id: string; name: string; owner_id: number } | undefined;
}

export function fedChats(fedId: string): number[] {
  return (db.prepare("SELECT chat_id FROM fed_chats WHERE fed_id = ?").all(fedId) as Array<{ chat_id: number }>).map(
    (r) => r.chat_id,
  );
}

export function addFedBan(fedId: string, userId: number, reason: string | undefined) {
  db.prepare(
    `INSERT INTO fed_bans (fed_id, user_id, reason, ts) VALUES (?, ?, ?, ?)
     ON CONFLICT(fed_id, user_id) DO UPDATE SET reason = excluded.reason, ts = excluded.ts`,
  ).run(fedId, userId, reason ?? null, now());
}

export function removeFedBan(fedId: string, userId: number): boolean {
  return db.prepare("DELETE FROM fed_bans WHERE fed_id = ? AND user_id = ?").run(fedId, userId).changes > 0;
}

export function getFedBan(fedId: string, userId: number) {
  return db.prepare("SELECT reason FROM fed_bans WHERE fed_id = ? AND user_id = ?").get(fedId, userId) as
    | { reason: string | null }
    | undefined;
}

export function fedBanCount(fedId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM fed_bans WHERE fed_id = ?").get(fedId) as { n: number }).n;
}

export function listFedBans(fedId: string) {
  return db
    .prepare("SELECT user_id, reason, ts FROM fed_bans WHERE fed_id = ? ORDER BY ts")
    .all(fedId) as Array<{ user_id: number; reason: string | null; ts: number }>;
}

// Fed admins may /fban and /unfban alongside the owner.
export function addFedAdmin(fedId: string, userId: number) {
  db.prepare("INSERT OR IGNORE INTO fed_admins (fed_id, user_id) VALUES (?, ?)").run(fedId, userId);
}

export function removeFedAdmin(fedId: string, userId: number): boolean {
  return db.prepare("DELETE FROM fed_admins WHERE fed_id = ? AND user_id = ?").run(fedId, userId).changes > 0;
}

export function isFedAdmin(fedId: string, userId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM fed_admins WHERE fed_id = ? AND user_id = ?").get(fedId, userId));
}

export function fedAdminCount(fedId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM fed_admins WHERE fed_id = ?").get(fedId) as { n: number }).n;
}

// ---------- per-user admin notes (shown in /info) ----------

const USER_NOTE_CAP = 20;

export function addUserNote(chatId: number, userId: number, note: string, author: string | undefined) {
  db.prepare("INSERT INTO user_notes (chat_id, user_id, note, author, ts) VALUES (?, ?, ?, ?, ?)").run(
    chatId,
    userId,
    note.slice(0, 500),
    author ?? null,
    now(),
  );
  db.prepare(
    `DELETE FROM user_notes WHERE chat_id = ? AND user_id = ? AND id NOT IN
       (SELECT id FROM user_notes WHERE chat_id = ? AND user_id = ? ORDER BY ts DESC LIMIT ?)`,
  ).run(chatId, userId, chatId, userId, USER_NOTE_CAP);
}

export function listUserNotes(chatId: number, userId: number) {
  return db
    .prepare("SELECT id, note, author, ts FROM user_notes WHERE chat_id = ? AND user_id = ? ORDER BY ts DESC, id DESC")
    .all(chatId, userId) as Array<{ id: number; note: string; author: string | null; ts: number }>;
}

export function deleteUserNotes(chatId: number, userId: number): number {
  return db.prepare("DELETE FROM user_notes WHERE chat_id = ? AND user_id = ?").run(chatId, userId).changes;
}

// ---------- activity stats (from the ambient message log) ----------

export function messageStats(chatId: number) {
  const t24 = now() - 86400;
  const t7d = now() - 7 * 86400;
  const total24h = (db.prepare("SELECT COUNT(*) AS n FROM message_log WHERE chat_id = ? AND ts > ?").get(chatId, t24) as { n: number }).n;
  const total7d = (db.prepare("SELECT COUNT(*) AS n FROM message_log WHERE chat_id = ? AND ts > ?").get(chatId, t7d) as { n: number }).n;
  const perDay = db
    .prepare(
      `SELECT date(ts, 'unixepoch') AS day, COUNT(*) AS count FROM message_log
       WHERE chat_id = ? AND ts > ? GROUP BY day ORDER BY day`,
    )
    .all(chatId, t7d) as Array<{ day: string; count: number }>;
  const topUsers = db
    .prepare(
      `SELECT name, COUNT(*) AS count FROM message_log
       WHERE chat_id = ? AND ts > ? AND name IS NOT NULL GROUP BY user_id ORDER BY count DESC LIMIT 5`,
    )
    .all(chatId, t7d) as Array<{ name: string; count: number }>;
  return { total24h, total7d, perDay, topUsers };
}

/** Distinct recently-active members (for /tagall mentions), newest first. */
export function recentMemberIds(chatId: number, limit = 30) {
  return db
    .prepare(
      `SELECT user_id, name, MAX(ts) AS last FROM message_log
       WHERE chat_id = ? AND user_id IS NOT NULL GROUP BY user_id ORDER BY last DESC LIMIT ?`,
    )
    .all(chatId, limit) as Array<{ user_id: number; name: string | null }>;
}

/** Chats that have a night-mode window configured (cheap JSON LIKE scan). */
export function chatsWithNight(): number[] {
  return (
    db.prepare(`SELECT chat_id FROM chats WHERE settings LIKE '%"night":%'`).all() as Array<{ chat_id: number }>
  ).map((r) => r.chat_id);
}

/** Full ambient log rows for lexical /recall search (bounded by LOG_CAP). */
export function allLoggedMessages(chatId: number) {
  return db
    .prepare("SELECT name, text, ts FROM message_log WHERE chat_id = ? ORDER BY ts DESC")
    .all(chatId) as Array<{ name: string | null; text: string; ts: number }>;
}

// ---------- approvals (trusted users exempt from all automatic filters) ----------

export function approveUser(chatId: number, userId: number, name: string | undefined) {
  db.prepare(
    `INSERT INTO approvals (chat_id, user_id, name) VALUES (?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET name = COALESCE(excluded.name, approvals.name)`,
  ).run(chatId, userId, name ?? null);
}

export function unapproveUser(chatId: number, userId: number): boolean {
  return db.prepare("DELETE FROM approvals WHERE chat_id = ? AND user_id = ?").run(chatId, userId).changes > 0;
}

export function isApproved(chatId: number, userId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM approvals WHERE chat_id = ? AND user_id = ?").get(chatId, userId));
}

export function listApproved(chatId: number) {
  return db
    .prepare("SELECT user_id, name FROM approvals WHERE chat_id = ? ORDER BY user_id")
    .all(chatId) as Array<{ user_id: number; name: string | null }>;
}

// ---------- AI usage metering (per-chat daily quota) ----------

/** Today's AI-answer count for the chat (read-only; no side effects). */
export function getAiUsageToday(chatId: number): number {
  const day = new Date().toISOString().slice(0, 10);
  const row = db.prepare("SELECT count FROM ai_usage WHERE chat_id = ? AND day = ?").get(chatId, day) as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

/** Bump today's AI-answer counter for the chat and return the new count. */
export function bumpAiUsage(chatId: number): number {
  const day = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare(
      `INSERT INTO ai_usage (chat_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(chat_id, day) DO UPDATE SET count = count + 1 RETURNING count`,
    )
    .get(chatId, day) as { count: number };
  // Drop old rows opportunistically so the table never grows unbounded.
  db.prepare("DELETE FROM ai_usage WHERE day < ?").run(new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10));
  return row.count;
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

export function getKarma(chatId: number, userId: number): number {
  const row = db.prepare("SELECT score FROM karma WHERE chat_id = ? AND user_id = ?").get(chatId, userId) as
    | { score: number }
    | undefined;
  return row?.score ?? 0;
}

export function topKarma(chatId: number, limit = 10) {
  return db
    .prepare("SELECT user_id, name, score FROM karma WHERE chat_id = ? ORDER BY score DESC LIMIT ?")
    .all(chatId, limit) as Array<{ user_id: number; name: string | null; score: number }>;
}

// ---------- business leads (AI-labelled customer conversations) ----------

export interface BusinessLead {
  connection_id: string;
  chat_id: number;
  name: string | null;
  label: string | null;
  urgency: string | null;
  summary: string | null;
  messages: number;
  updated_at: number;
}

/** Record (or refresh) the AI label for one customer conversation. */
export function upsertLead(
  connectionId: string,
  chatId: number,
  name: string | undefined,
  label: string | undefined,
  urgency: string | undefined,
  summary: string | undefined,
) {
  db.prepare(
    `INSERT INTO business_leads (connection_id, chat_id, name, label, urgency, summary, messages, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(connection_id, chat_id) DO UPDATE SET
       name = COALESCE(excluded.name, business_leads.name),
       label = COALESCE(excluded.label, business_leads.label),
       urgency = COALESCE(excluded.urgency, business_leads.urgency),
       summary = COALESCE(excluded.summary, business_leads.summary),
       messages = business_leads.messages + 1,
       updated_at = excluded.updated_at`,
  ).run(connectionId, chatId, name ?? null, label ?? null, urgency ?? null, summary ?? null, now());
}

/** Owner inbox: most recently active conversations, optionally by label. */
export function listLeads(userId: number, label?: string, limit = 20): BusinessLead[] {
  const base = `SELECT l.* FROM business_leads l
     JOIN business_connections c ON c.connection_id = l.connection_id
     WHERE c.user_id = ?`;
  return label
    ? (db.prepare(`${base} AND l.label = ? ORDER BY l.updated_at DESC LIMIT ?`).all(userId, label, limit) as BusinessLead[])
    : (db.prepare(`${base} ORDER BY l.updated_at DESC LIMIT ?`).all(userId, limit) as BusinessLead[]);
}

/** Which providers currently have a key stored (NAMES ONLY, never values). */
export function listProvidersWithKeys(): string[] {
  return (db.prepare("SELECT provider FROM provider_keys ORDER BY provider").all() as Array<{ provider: string }>).map(
    (r) => r.provider,
  );
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
