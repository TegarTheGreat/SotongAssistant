import { Composer, type Context } from "grammy";
import { saveNote, getNote, deleteNote, listNotes, getSettings, updateSettings } from "../db/repo.js";
import { senderIsAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Reusable notes (/save name → recall with #name) and group rules —
 * the classic community-bot knowledge base, stored per chat.
 */
export const notes = new Composer<Context>();

const NAME_RE = /^[\p{L}\p{N}_-]{1,32}$/u;

notes.command("save", async (ctx) => {
  if (!(await senderIsAdmin(ctx)) && ctx.chat.type !== "private") {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const [name, ...rest] = ctx.match.trim().split(/\s+/);
  const inline = rest.join(" ");
  const replied = ctx.message?.reply_to_message?.text ?? ctx.message?.reply_to_message?.caption;
  const content = inline || replied;
  if (!name || !NAME_RE.test(name) || !content) {
    await ctx.reply(tc(ctx, "notes.usage"));
    return;
  }
  saveNote(ctx.chat.id, name.toLowerCase(), content);
  await ctx.reply(tc(ctx, "notes.saved", { name: name.toLowerCase() }), { parse_mode: "HTML" });
});

notes.command("clear", async (ctx) => {
  if (!(await senderIsAdmin(ctx)) && ctx.chat.type !== "private") {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const name = ctx.match.trim().replace(/^#/, "").toLowerCase();
  if (!name) {
    await ctx.reply(tc(ctx, "notes.usage"));
    return;
  }
  const ok = deleteNote(ctx.chat.id, name);
  await ctx.reply(tc(ctx, ok ? "notes.deleted" : "notes.notFound", { name }), { parse_mode: "HTML" });
});

notes.command("notes", async (ctx) => {
  const names = listNotes(ctx.chat.id);
  if (!names.length) {
    await ctx.reply(tc(ctx, "notes.empty"));
    return;
  }
  await ctx.reply(
    tc(ctx, "notes.list", { names: names.map((n) => `<code>#${escapeHtml(n)}</code>`).join(" ") }),
    { parse_mode: "HTML" },
  );
});

// Recall: a message that is exactly "#name" (possibly with the note name only).
notes.on("message:text", async (ctx, next) => {
  const m = /^#([\p{L}\p{N}_-]{1,32})$/u.exec(ctx.message.text.trim());
  if (m) {
    const content = getNote(ctx.chat.id, m[1]!.toLowerCase());
    if (content) {
      await ctx.reply(escapeHtml(content), {
        parse_mode: "HTML",
        message_thread_id: threadIdOf(ctx),
        reply_parameters: ctx.message.reply_to_message
          ? { message_id: ctx.message.reply_to_message.message_id }
          : undefined,
      });
      return;
    }
  }
  await next();
});

// ---------- rules ----------

notes.command("setrules", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const text = ctx.match.trim() || ctx.message?.reply_to_message?.text;
  if (!text) {
    await ctx.reply(tc(ctx, "rules.none"));
    return;
  }
  updateSettings(ctx.chat.id, { rules: text });
  await ctx.reply(tc(ctx, "rules.set"));
});

notes.command("rules", async (ctx) => {
  const rules = getSettings(ctx.chat.id).rules;
  if (!rules) {
    await ctx.reply(tc(ctx, "rules.none"));
    return;
  }
  await ctx.reply(`📜 ${escapeHtml(rules)}`, { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) });
});
