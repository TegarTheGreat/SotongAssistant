import { Composer, type Context } from "grammy";
import { senderIsAdmin } from "../util/admin.js";
import { escapeHtml, humanDuration } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";
import { getVersionInfo } from "../services/updater.js";
import { config } from "../config.js";

/** Everyday utilities: /ping /uptime /echo /del /admins /invite /about. */
export const utility = new Composer<Context>();

const bootedAt = Date.now();

utility.command("ping", async (ctx) => {
  const t0 = Date.now();
  await ctx.api.getMe();
  await ctx.reply(tc(ctx, "util.pong", { ms: Date.now() - t0 }), { message_thread_id: threadIdOf(ctx) });
});

utility.command("uptime", async (ctx) => {
  const seconds = Math.floor((Date.now() - bootedAt) / 1000);
  await ctx.reply(tc(ctx, "util.uptime", { duration: humanDuration(Math.max(60, seconds)) }), {
    message_thread_id: threadIdOf(ctx),
  });
});

// /echo <text> — the bot repeats it and the command vanishes (admins only).
utility.command("echo", async (ctx) => {
  if (ctx.chat.type !== "private" && !(await senderIsAdmin(ctx))) return;
  const text = ctx.match.trim();
  if (!text) return;
  await ctx.deleteMessage().catch(() => undefined);
  await ctx.reply(escapeHtml(text), { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) });
});

// /del — delete the replied message plus the command (admins).
utility.command("del", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) return;
  const target = ctx.message?.reply_to_message?.message_id;
  if (target) await ctx.api.deleteMessage(ctx.chat.id, target).catch(() => undefined);
  await ctx.deleteMessage().catch(() => undefined);
});

utility.command("admins", async (ctx) => {
  if (ctx.chat.type === "private") return;
  const admins = await ctx.api.getChatAdministrators(ctx.chat.id);
  const rows = admins
    .filter((a) => !a.user.is_bot)
    .map((a) => `• ${escapeHtml(a.user.first_name)}${a.status === "creator" ? " 👑" : ""}`)
    .join("\n");
  await ctx.reply(`${tc(ctx, "util.admins")}\n${rows}`, {
    parse_mode: "HTML",
    message_thread_id: threadIdOf(ctx),
  });
});

// /invite — a fresh single-use style invite link (admins, needs can_invite_users).
utility.command("invite", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) return;
  try {
    const link = await ctx.api.createChatInviteLink(ctx.chat.id, {});
    await ctx.reply(link.invite_link, { message_thread_id: threadIdOf(ctx) });
  } catch {
    await ctx.reply(tc(ctx, "mod.noRights", { right: "can_invite_users" }), { parse_mode: "HTML" });
  }
});

utility.command("about", async (ctx) => {
  const v = await getVersionInfo();
  const seconds = Math.floor((Date.now() - bootedAt) / 1000);
  await ctx.reply(
    tc(ctx, "about.text", {
      version: v.version,
      commit: v.commit ?? "-",
      model: `${config.defaultProvider}/${config.defaultModel}`,
      uptime: humanDuration(Math.max(60, seconds)),
    }),
    { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) },
  );
});
