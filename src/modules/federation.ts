import { randomBytes } from "node:crypto";
import { Composer, type Context } from "grammy";
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
    }),
    { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) },
  );
});

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
  if (ctx.from?.id !== fed.owner_id) {
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
  if (ctx.from?.id !== fed.owner_id) {
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
