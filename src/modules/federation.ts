import { randomBytes } from "node:crypto";
import { Composer, InputFile, type Context } from "grammy";
import { config } from "../config.js";
import {
  createFederation,
  getFederation,
  joinFederation,
  leaveFederation,
  fedOfChat,
  fedChats,
  addFedBan,
  removeFedBan,
  getFedBan,
  fedBanCount,
  listFedBans,
  addFedAdmin,
  removeFedAdmin,
  isFedAdmin,
  fedAdminCount,
} from "../db/repo.js";
import { senderIsAdmin, isProtectedTarget } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Federations: one shared ban list across many groups (Rose-style).
 *  - /newfed <name> in DM creates a federation you own
 *  - /joinfed <id> (group admin) links the group; /leavefed unlinks
 *  - /fban & /unfban (fed owner, by reply or user id) ban/unban everywhere
 *  - joining members on the fed ban list are removed automatically
 * The enforcement handler is registered BEFORE onboarding in main.ts so a
 * fed-banned join never gets a welcome or captcha.
 */
export const federation = new Composer<Context>();

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

federation.command("newfed", async (ctx) => {
  if (ctx.chat.type !== "private" || !ctx.from) {
    await ctx.reply(tc(ctx, "error.dmOnly"));
    return;
  }
  const name = ctx.match.trim().slice(0, 64);
  if (!name) {
    await ctx.reply(tc(ctx, "fed.usage"));
    return;
  }
  const fedId = randomBytes(4).toString("hex");
  createFederation(fedId, name, ctx.from.id);
  await ctx.reply(tc(ctx, "fed.created", { name: escapeHtml(name), id: fedId }), { parse_mode: "HTML" });
});

federation.command("joinfed", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const fedId = ctx.match.trim().toLowerCase();
  const fed = fedId ? getFederation(fedId) : undefined;
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.usage"));
    return;
  }
  joinFederation(fed.fed_id, ctx.chat.id);
  await ctx.reply(tc(ctx, "fed.joined", { name: escapeHtml(fed.name) }), { parse_mode: "HTML" });
});

federation.command("leavefed", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const left = leaveFederation(ctx.chat.id);
  await ctx.reply(tc(ctx, left ? "fed.left" : "fed.none"));
});

federation.command("fedinfo", async (ctx) => {
  if (!isGroup(ctx)) return;
  const fed = fedOfChat(ctx.chat.id);
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.none"));
    return;
  }
  await ctx.reply(
    tc(ctx, "fed.info", {
      name: escapeHtml(fed.name),
      id: fed.fed_id,
      chats: fedChats(fed.fed_id).length,
      bans: fedBanCount(fed.fed_id),
      admins: fedAdminCount(fed.fed_id) + 1, // owner counts too
    }),
    { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) },
  );
});

/** The fed owner and promoted fed admins may manage bans. */
function canManageFed(fed: { fed_id: string; owner_id: number }, userId: number | undefined): boolean {
  if (!userId) return false;
  return userId === fed.owner_id || isFedAdmin(fed.fed_id, userId);
}

/** Resolve the target of /fban & /unfban: by reply, or a numeric first argument. */
function fedTarget(ctx: Context): { userId: number; name: string; reason?: string } | undefined {
  const replied = ctx.message?.reply_to_message?.from;
  const parts = String(ctx.match ?? "").trim().split(/\s+/).filter(Boolean);
  if (replied && !replied.is_bot) {
    return { userId: replied.id, name: replied.first_name, reason: parts.join(" ") || undefined };
  }
  const id = Number(parts[0]);
  if (Number.isInteger(id) && id > 0) {
    return { userId: id, name: String(id), reason: parts.slice(1).join(" ") || undefined };
  }
  return undefined;
}

federation.command("fban", async (ctx) => {
  if (!isGroup(ctx)) return;
  const fed = fedOfChat(ctx.chat.id);
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.none"));
    return;
  }
  if (!canManageFed(fed, ctx.from?.id)) {
    await ctx.reply(tc(ctx, "fed.notOwner"));
    return;
  }
  const target = fedTarget(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  if (await isProtectedTarget(ctx, target.userId)) {
    await ctx.reply(tc(ctx, "error.targetProtected"));
    return;
  }
  addFedBan(fed.fed_id, target.userId, target.reason);
  let banned = 0;
  for (const chatId of fedChats(fed.fed_id)) {
    try {
      await ctx.api.banChatMember(chatId, target.userId);
      banned++;
    } catch {
      /* not admin there (or user is admin there) — the DB ban still gates joins */
    }
  }
  await ctx.reply(tc(ctx, "fed.banned", { name: escapeHtml(target.name), count: banned }), {
    parse_mode: "HTML",
  });
});

federation.command("unfban", async (ctx) => {
  if (!isGroup(ctx)) return;
  const fed = fedOfChat(ctx.chat.id);
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.none"));
    return;
  }
  if (!canManageFed(fed, ctx.from?.id)) {
    await ctx.reply(tc(ctx, "fed.notOwner"));
    return;
  }
  const target = fedTarget(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  removeFedBan(fed.fed_id, target.userId);
  let lifted = 0;
  for (const chatId of fedChats(fed.fed_id)) {
    try {
      await ctx.api.unbanChatMember(chatId, target.userId, { only_if_banned: true });
      lifted++;
    } catch {
      /* skip chats where we lack rights */
    }
  }
  await ctx.reply(tc(ctx, "fed.unbanned", { name: escapeHtml(target.name), count: lifted }), {
    parse_mode: "HTML",
  });
});

// ---------- fed admins (owner-managed co-moderators) ----------

federation.command("fpromote", async (ctx) => {
  if (!isGroup(ctx)) return;
  const fed = fedOfChat(ctx.chat.id);
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.none"));
    return;
  }
  if (ctx.from?.id !== fed.owner_id) {
    await ctx.reply(tc(ctx, "fed.notOwner"));
    return;
  }
  const target = fedTarget(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  addFedAdmin(fed.fed_id, target.userId);
  await ctx.reply(tc(ctx, "fed.promoted", { name: escapeHtml(target.name) }), { parse_mode: "HTML" });
});

federation.command("fdemote", async (ctx) => {
  if (!isGroup(ctx)) return;
  const fed = fedOfChat(ctx.chat.id);
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.none"));
    return;
  }
  if (ctx.from?.id !== fed.owner_id) {
    await ctx.reply(tc(ctx, "fed.notOwner"));
    return;
  }
  const target = fedTarget(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  removeFedAdmin(fed.fed_id, target.userId);
  await ctx.reply(tc(ctx, "fed.demoted", { name: escapeHtml(target.name) }), { parse_mode: "HTML" });
});

// ---------- ban list portability ----------

// /fexport — the whole ban list as a JSON document (re-importable anywhere).
federation.command("fexport", async (ctx) => {
  if (!isGroup(ctx)) return;
  const fed = fedOfChat(ctx.chat.id);
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.none"));
    return;
  }
  if (!canManageFed(fed, ctx.from?.id)) {
    await ctx.reply(tc(ctx, "fed.notOwner"));
    return;
  }
  const payload = {
    format: "sotong-fedbans-v1",
    fed_id: fed.fed_id,
    name: fed.name,
    exported_at: new Date().toISOString(),
    bans: listFedBans(fed.fed_id).map((b) => ({ user_id: b.user_id, reason: b.reason ?? undefined })),
  };
  const file = new InputFile(Buffer.from(JSON.stringify(payload, null, 2)), `fedbans-${fed.fed_id}.json`);
  await ctx.replyWithDocument(file, { caption: `🛡 ${payload.bans.length}` });
});

// /fimport — reply to an exported JSON document to merge its bans (owner only).
federation.command("fimport", async (ctx) => {
  if (!isGroup(ctx)) return;
  const fed = fedOfChat(ctx.chat.id);
  if (!fed) {
    await ctx.reply(tc(ctx, "fed.none"));
    return;
  }
  if (ctx.from?.id !== fed.owner_id) {
    await ctx.reply(tc(ctx, "fed.notOwner"));
    return;
  }
  const doc = ctx.message?.reply_to_message?.document;
  if (!doc || (doc.file_size ?? 0) > 2_000_000) {
    await ctx.reply(tc(ctx, "fed.importUsage"));
    return;
  }
  try {
    const file = await ctx.api.getFile(doc.file_id);
    const res = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json()) as { format?: string; bans?: Array<{ user_id?: number; reason?: string }> };
    if (data.format !== "sotong-fedbans-v1" || !Array.isArray(data.bans)) throw new Error("bad format");
    let imported = 0;
    for (const b of data.bans.slice(0, 10_000)) {
      if (Number.isInteger(b.user_id) && b.user_id! > 0) {
        addFedBan(fed.fed_id, b.user_id!, b.reason);
        imported++;
      }
    }
    await ctx.reply(tc(ctx, "fed.imported", { count: imported }));
  } catch {
    await ctx.reply(tc(ctx, "fed.importUsage"));
  }
});

// ---------- enforcement: fed-banned users are removed the moment they join ----------

federation.on("chat_member", async (ctx, next) => {
  const upd = ctx.chatMember;
  if (upd.chat.type !== "group" && upd.chat.type !== "supergroup") return next();
  const newM = upd.new_chat_member;
  const joined = newM.status === "member" || (newM.status === "restricted" && newM.is_member);
  if (!joined || newM.user.is_bot) return next();

  const fed = fedOfChat(upd.chat.id);
  const ban = fed && getFedBan(fed.fed_id, newM.user.id);
  if (!ban) return next();

  try {
    await ctx.api.banChatMember(upd.chat.id, newM.user.id);
    await ctx.api.sendMessage(
      upd.chat.id,
      tc(ctx, "fed.autobanned", { name: escapeHtml(newM.user.first_name) }),
      { parse_mode: "HTML" },
    );
    // Handled — onboarding must not welcome or captcha this user.
    return;
  } catch {
    // Could not ban (missing rights) — let the normal pipeline continue.
    return next();
  }
});
