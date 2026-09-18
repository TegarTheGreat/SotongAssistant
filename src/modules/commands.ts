import { Composer, type Context } from "grammy";
import { getSettings, updateSettings } from "../db/repo.js";
import { senderIsAdmin, isAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * Per-chat command management (Rose-style /disable): admins can switch any
 * command off for regular members; disabled commands are deleted on sight.
 * Registered FIRST in main.ts so the interception happens before any module
 * gets to handle the command. Admins are always exempt.
 */
export const commands = new Composer<Context>();

/** Commands that must never be disabled, or admins could lock themselves out. */
const PROTECTED = new Set(["enable", "disable", "disabled", "settings", "start", "help"]);

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

function normalizeCommand(input: string): string {
  return input.trim().toLowerCase().replace(/^\//, "").split("@")[0]!;
}

commands.command("disable", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const cmd = normalizeCommand(ctx.match);
  if (!cmd || !/^[a-z0-9_]{1,32}$/.test(cmd)) {
    await ctx.reply(tc(ctx, "cmd.usage"));
    return;
  }
  if (PROTECTED.has(cmd)) {
    await ctx.reply(tc(ctx, "cmd.protected", { cmd }));
    return;
  }
  const list = getSettings(ctx.chat.id).disabledCommands ?? [];
  if (!list.includes(cmd)) updateSettings(ctx.chat.id, { disabledCommands: [...list, cmd].slice(0, 100) });
  await ctx.reply(tc(ctx, "cmd.disabled", { cmd }));
});

commands.command("enable", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const cmd = normalizeCommand(ctx.match);
  if (!cmd) {
    await ctx.reply(tc(ctx, "cmd.usage"));
    return;
  }
  const list = getSettings(ctx.chat.id).disabledCommands ?? [];
  updateSettings(ctx.chat.id, { disabledCommands: list.filter((c) => c !== cmd) });
  await ctx.reply(tc(ctx, "cmd.enabled", { cmd }));
});

commands.command("disabled", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const list = getSettings(ctx.chat.id).disabledCommands ?? [];
  await ctx.reply(
    list.length
      ? tc(ctx, "cmd.list", { cmds: list.map((c) => `<code>/${escapeHtml(c)}</code>`).join(" ") })
      : tc(ctx, "cmd.listEmpty"),
    { parse_mode: "HTML" },
  );
});

// The gate: a disabled command from a non-admin is deleted and goes nowhere.
commands.on("message:text", async (ctx, next) => {
  const text = ctx.message.text;
  if (isGroup(ctx) && ctx.from && !ctx.from.is_bot && text.startsWith("/")) {
    const cmd = normalizeCommand(text.slice(1).split(/\s/)[0] ?? "");
    const disabled = getSettings(ctx.chat.id).disabledCommands ?? [];
    if (cmd && disabled.includes(cmd) && !(await isAdmin(ctx, ctx.from.id))) {
      await ctx.deleteMessage().catch(() => undefined);
      return;
    }
  }
  await next();
});
