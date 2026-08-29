import path from "node:path";
import { writeFileSync } from "node:fs";
import { Composer, InputFile, type Context } from "grammy";
import { config } from "../config.js";
import { checkpoint, restorePath } from "../db/index.js";
import { listKnownChats, upsertChat, migrateChatId } from "../db/repo.js";
import { isGitCheckout, checkForUpdates, applyUpdate } from "../services/updater.js";
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

// /export — owner only, DM only: send the SQLite database as a backup file.
// Contains encrypted provider keys, settings, notes, memories.
manager.command("export", async (ctx) => {
  if (ctx.chat.type !== "private" || ctx.from?.id !== config.ownerId) return;
  checkpoint(); // flush the WAL so the file is a complete snapshot
  const file = new InputFile(path.join(config.dataDir, "sotong.db"), "sotong-backup.db");
  await ctx.replyWithDocument(file, { caption: `📦 ${new Date().toISOString().slice(0, 10)}` });
});

// /import — owner only, DM only: reply to an /export backup file to restore it.
// The file is staged next to the live DB and swapped in on the next boot
// (db/index.ts), so the open database file is never clobbered.
manager.command("import", async (ctx) => {
  if (ctx.chat.type !== "private" || ctx.from?.id !== config.ownerId) return;
  const doc = ctx.message?.reply_to_message?.document;
  if (!doc || (doc.file_size ?? 0) > 19_000_000) {
    await ctx.reply(tc(ctx, "import.usage"));
    return;
  }
  try {
    const file = await ctx.api.getFile(doc.file_id);
    const res = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(60_000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    // A real SQLite database starts with this exact 16-byte header.
    if (!buf.subarray(0, 15).equals(Buffer.from("SQLite format 3"))) {
      await ctx.reply(tc(ctx, "import.usage"));
      return;
    }
    writeFileSync(restorePath, buf);
    await ctx.reply(tc(ctx, "import.done"));
    process.exit(0); // the supervisor restarts us; boot swaps the file in
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message.slice(0, 200) }));
  }
});

// /broadcast <text> — owner only, DM only: deliver to every managed group/channel.
manager.command("broadcast", async (ctx) => {
  if (ctx.chat.type !== "private" || ctx.from?.id !== config.ownerId) return;
  const text = ctx.match.trim();
  if (!text) {
    await ctx.reply(tc(ctx, "broadcast.usage"));
    return;
  }
  const targets = listKnownChats().filter(
    (c) => c.type !== "private" && (c.status === "member" || c.status === "administrator"),
  );
  let sent = 0;
  for (const chat of targets) {
    try {
      await ctx.api.sendMessage(chat.chat_id, `📣 ${escapeHtml(text)}`, { parse_mode: "HTML" });
      sent++;
    } catch {
      /* kicked or restricted there — skip */
    }
    // Stay well inside the ~30 msg/s global budget.
    await new Promise((r) => setTimeout(r, 1200));
  }
  await ctx.reply(tc(ctx, "broadcast.done", { count: sent }));
});

// /update — owner only, DM only: git pull + npm ci, then exit(0) so the
// process supervisor (systemd/pm2/Docker restart policy) boots the new code.
manager.command("update", async (ctx) => {
  if (ctx.chat.type !== "private" || ctx.from?.id !== config.ownerId) return;
  if (!isGitCheckout()) {
    await ctx.reply(tc(ctx, "update.notGit"));
    return;
  }
  const behind = await checkForUpdates();
  if (!behind) {
    await ctx.reply(tc(ctx, "update.none"));
    return;
  }
  await ctx.reply(tc(ctx, "update.applying", { count: behind }));
  try {
    await applyUpdate();
    await ctx.reply(tc(ctx, "update.done"));
    process.exit(0);
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message.slice(0, 300) }));
  }
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
    tc(ctx, "help.more"),
    tc(ctx, "help.footer"),
  ];
  await ctx.reply(sections.join("\n\n"), { parse_mode: "HTML" });
});
