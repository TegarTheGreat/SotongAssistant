import { Composer, type Context } from "grammy";
import { config } from "../config.js";
import { listKnownChats, upsertChat, migrateChatId } from "../db/repo.js";
import { invalidateAdminCache } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * "Bot manager": the bot's awareness of every chat it lives in, its admin
 * rights per chat, and owner-facing status commands.
 */
export const manager = new Composer<Context>();

// The bot's own status changed (added, promoted, kicked, blocked).
manager.on("my_chat_member", async (ctx) => {
  const upd = ctx.myChatMember;
  const me = upd.new_chat_member;
  const rights = me.status === "administrator" ? me : undefined;
  upsertChat(upd.chat.id, upd.chat.type, "title" in upd.chat ? upd.chat.title : undefined, me.status, rights);
  invalidateAdminCache(upd.chat.id);

  if (me.status === "member" && (upd.chat.type === "group" || upd.chat.type === "supergroup")) {
    await ctx.api
      .sendMessage(upd.chat.id, tc(ctx, "manager.needAdmin"), { parse_mode: "HTML" })
      .catch(() => undefined);
  }
});

// Group→supergroup migration changes the chat id permanently — move all data.
manager.on("message:migrate_to_chat_id", (ctx) => {
  const newId = ctx.message.migrate_to_chat_id;
  if (newId) migrateChatId(ctx.chat.id, newId);
});

manager.command("status", async (ctx) => {
  if (ctx.chat.type !== "private" || ctx.from?.id !== config.ownerId) return;
  const chats = listKnownChats();
  if (!chats.length) {
    await ctx.reply(tc(ctx, "status.empty"));
    return;
  }
  const lines = chats.map((c) => {
    const admin = c.rights ? " · admin" : "";
    return `• <b>${escapeHtml(c.title ?? String(c.chat_id))}</b> (${c.type}) — ${c.status}${admin}`;
  });
  await ctx.reply(`${tc(ctx, "status.title")}\n${lines.join("\n")}`, { parse_mode: "HTML" });
});

manager.command("id", async (ctx) => {
  await ctx.reply(
    `chat_id: <code>${ctx.chat.id}</code>` + (ctx.from ? `\nuser_id: <code>${ctx.from.id}</code>` : ""),
    { parse_mode: "HTML" },
  );
});

manager.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.reply(tc(ctx, "start.body"), { parse_mode: "HTML" });
});

manager.command("help", async (ctx) => {
  const sections = [
    tc(ctx, "help.title"),
    tc(ctx, "help.ai"),
    tc(ctx, "help.moderation"),
    tc(ctx, "help.group"),
    tc(ctx, "help.fun"),
    tc(ctx, "help.footer"),
  ];
  await ctx.reply(sections.join("\n\n"), { parse_mode: "HTML" });
});
