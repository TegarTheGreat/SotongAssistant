import { Composer, type Context } from "grammy";
import { config } from "../config.js";
import {
  getBusinessConnection,
  upsertBusinessConnection,
  getMemory,
  saveMemory,
  upsertLead,
  listLeads,
} from "../db/repo.js";
import { getCatalog } from "../services/catalog.js";
import { streamCompletion } from "../services/ai/index.js";
import { markdownToTelegramHtml, escapeHtml, humanDuration } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * Telegram Business: a Premium user connects the bot via
 * Settings → Telegram Business → Chatbots; the bot then receives
 * business_connection + business_message updates and replies on their behalf.
 *
 * Abuse control: strangers drive these AI calls on the owner's API key, so
 * every peer is rate-limited and concurrency is capped per connection.
 *
 * Each conversation is also auto-LABELLED by the model (intent + urgency +
 * one-line summary) so the owner gets a triaged inbox via /leads instead of
 * scrolling raw chats. Labelling reuses the reply that was generated anyway,
 * so it costs no extra AI call.
 */
export const business = new Composer<Context>();

const peerLastReply = new Map<string, number>();
const activeReplies = new Set<string>();
const PEER_COOLDOWN_MS = 15_000;
const MAX_MAP = 5_000;

business.on("business_connection", async (ctx) => {
  const conn = ctx.businessConnection;
  const canReply = Boolean(conn.rights?.can_reply);
  upsertBusinessConnection(conn.id, conn.user.id, conn.is_enabled, canReply);
  if (conn.is_enabled) {
    await ctx.api
      .sendMessage(
        conn.user.id,
        "🤝 Your business account is now connected to SotongAssistant." +
          (canReply
            ? " I'll help answer incoming chats with AI."
            : " Grant the 'reply to messages' permission so I can answer."),
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
  // Never answer the account owner's own outgoing messages.
  if (msg.from?.id === conn.user_id) return;
  const text = msg.text;
  if (!text) return;

  // Per-peer cooldown + one concurrent generation per connection.
  const peerKey = `${connId}:${msg.chat.id}`;
  if (Date.now() - (peerLastReply.get(peerKey) ?? 0) < PEER_COOLDOWN_MS) return;
  if (activeReplies.has(connId)) return;
  if (peerLastReply.size > MAX_MAP) peerLastReply.clear();
  peerLastReply.set(peerKey, Date.now());
  activeReplies.add(connId);

  try {
    const catalog = await getCatalog();
    const provider = catalog[config.defaultProvider];
    if (!provider) return;

    const memKey = `biz:${connId}:${msg.chat.id}`;
    const mem = getMemory(memKey);
    const reply = await streamCompletion(
      {
        provider,
        model: config.defaultModel,
        system:
          "You reply to incoming chats on behalf of a Telegram Business account owner. " +
          "Be polite and brief, note that the owner will follow up when needed, and " +
          "answer in the language of the person writing.\n\n" +
          "After your reply, append EXACTLY one final line in this form so the owner's " +
          "inbox can triage the conversation (it is stripped before sending):\n" +
          "###LABEL|<question|order|complaint|support|pricing|spam|other>|<low|normal|high>|<max 12-word summary in English>",
        history: mem.messages,
        userText: text,
        userName: msg.from?.first_name,
      },
      () => undefined, // no streaming edits in business chats
    );
    // Split the triage line off the customer-facing answer.
    const match = /^###LABEL\|([^|\n]*)\|([^|\n]*)\|([^\n]*)$/m.exec(reply);
    const visible = reply.replace(/^###LABEL\|.*$/m, "").trim();
    upsertLead(
      connId,
      msg.chat.id,
      msg.from?.first_name,
      match?.[1]?.trim().toLowerCase(),
      match?.[2]?.trim().toLowerCase(),
      match?.[3]?.trim(),
    );

    await ctx.api.sendMessage(msg.chat.id, markdownToTelegramHtml(visible || reply), {
      business_connection_id: connId,
      parse_mode: "HTML",
    });
    saveMemory(memKey, [
      ...mem.messages.slice(-18),
      { role: "user", name: msg.from?.first_name, text },
      { role: "assistant", text: visible || reply },
    ]);
  } catch (err) {
    console.warn("business reply failed:", (err as Error).message);
  } finally {
    activeReplies.delete(connId);
  }
});

/**
 * /leads [label] — the owner's triaged inbox of customer conversations,
 * newest first. Works in the owner's private chat with the bot.
 */
const URGENCY_ICON: Record<string, string> = { high: "🔴", normal: "🟡", low: "⚪" };

business.command("leads", async (ctx) => {
  if (ctx.chat.type !== "private" || !ctx.from) return;
  const label = ctx.match.trim().toLowerCase() || undefined;
  const leads = listLeads(ctx.from.id, label);
  if (!leads.length) {
    await ctx.reply(tc(ctx, "leads.empty"));
    return;
  }
  const nowS = Math.floor(Date.now() / 1000);
  const rows = leads
    .map((l) => {
      const icon = URGENCY_ICON[l.urgency ?? "normal"] ?? "🟡";
      const ago = humanDuration(Math.max(60, nowS - l.updated_at));
      const tag = l.label ? ` <code>${escapeHtml(l.label)}</code>` : "";
      return (
        `${icon} <b>${escapeHtml(l.name ?? String(l.chat_id))}</b>${tag} · ${l.messages} msg · ${ago}\n` +
        `   ${escapeHtml(l.summary ?? "—")}`
      );
    })
    .join("\n");
  await ctx.reply(`${tc(ctx, "leads.title", { n: leads.length })}\n\n${rows}`, { parse_mode: "HTML" });
});
