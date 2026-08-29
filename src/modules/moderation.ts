import { Composer, type Context } from "grammy";
import {
  addWarn,
  clearWarns,
  getWarns,
  getSettings,
  updateSettings,
  recentMemberIds,
  getKarma,
  getAfk,
  fedOfChat,
  getFedBan,
  addUserNote,
  listUserNotes,
  deleteUserNotes,
} from "../db/repo.js";
import { senderIsAdmin, isProtectedTarget } from "../util/admin.js";
import { parseDuration, humanDuration, escapeHtml } from "../util/format.js";
import { MUTED_PERMISSIONS, UNMUTED_PERMISSIONS } from "../util/permissions.js";
import { tc, type LocaleKey } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";
import { invalidateAdminCache } from "../util/admin.js";

export const moderation = new Composer<Context>();

/** Resolve a target from the replied message. Rejects channel personas (no user id). */
function targetFromReply(ctx: Context): { id: number; name: string } | undefined {
  const r = ctx.message?.reply_to_message;
  if (!r || r.sender_chat || !r.from) return undefined;
  return { id: r.from.id, name: escapeHtml(r.from.first_name) };
}

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

async function guard(ctx: Context): Promise<{ id: number; name: string } | undefined> {
  if (!isGroup(ctx)) {
    await ctx.reply(tc(ctx, "error.groupOnly"));
    return undefined;
  }
  if (!(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return undefined;
  }
  const target = targetFromReply(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return undefined;
  }
  if (await isProtectedTarget(ctx, target.id)) {
    await ctx.reply(tc(ctx, "error.targetProtected"));
    return undefined;
  }
  return target;
}

/** Run an API action; on a rights error, tell the admin which right is missing. */
async function withRights(ctx: Context, right: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/not enough rights|need administrator|CHAT_ADMIN_REQUIRED/i.test(msg)) {
      await ctx.reply(tc(ctx, "mod.noRights", { right }), { parse_mode: "HTML" });
      return false;
    }
    throw err;
  }
}

// ---------- warnings ----------

/**
 * Apply the configured warn-limit penalty (Rose-style warn mode).
 * Returns the action taken, or undefined when the bot lacked rights.
 * Shared with the /mp mod panel so both paths behave identically.
 */
export async function applyWarnAction(
  ctx: Context,
  chatId: number,
  userId: number,
): Promise<"mute" | "kick" | "ban" | undefined> {
  const action = getSettings(chatId).warnAction;
  const ok = await withRights(ctx, "can_restrict_members", async () => {
    if (action === "ban") {
      await ctx.api.banChatMember(chatId, userId);
    } else if (action === "kick") {
      await ctx.api.banChatMember(chatId, userId);
      await ctx.api.unbanChatMember(chatId, userId, { only_if_banned: true });
    } else {
      await ctx.api.restrictChatMember(chatId, userId, MUTED_PERMISSIONS, {
        until_date: Math.floor(Date.now() / 1000) + 24 * 3600,
      });
    }
  });
  return ok ? action : undefined;
}

moderation.command("warn", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const chatId = ctx.chat!.id;
  const count = addWarn(chatId, target.id);
  const { warnLimit } = getSettings(chatId);
  if (count < warnLimit) {
    await ctx.reply(tc(ctx, "mod.warned", { name: target.name, count, limit: warnLimit }), {
      parse_mode: "HTML",
    });
    return;
  }
  // Escalate: penalize first, and only clear the counter after it succeeded —
  // otherwise a rights failure would silently reset the offender to zero warns.
  const action = await applyWarnAction(ctx, chatId, target.id);
  if (!action) return;
  clearWarns(chatId, target.id);
  await ctx.reply(
    tc(ctx, "mod.warnEscalatedAction", {
      name: target.name,
      count,
      limit: warnLimit,
      action: tc(ctx, `warnmode.${action}` as LocaleKey),
    }),
    { parse_mode: "HTML" },
  );
});

// /warnmode mute|kick|ban — what the warn limit does.
moderation.command("warnmode", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const arg = ctx.match.trim().toLowerCase();
  if (arg !== "mute" && arg !== "kick" && arg !== "ban") {
    await ctx.reply(tc(ctx, "warnmode.usage", { current: getSettings(ctx.chat!.id).warnAction }));
    return;
  }
  updateSettings(ctx.chat!.id, { warnAction: arg });
  await ctx.reply(tc(ctx, "warnmode.set", { action: tc(ctx, `warnmode.${arg}` as LocaleKey) }));
});

moderation.command("unwarn", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  clearWarns(ctx.chat!.id, target.id);
  await ctx.reply(tc(ctx, "mod.warnsCleared", { name: target.name }), { parse_mode: "HTML" });
});

// ---------- mute / ban / kick ----------

moderation.command("mute", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const seconds = parseDuration(ctx.match.trim()) ?? 3600;
  const ok = await withRights(ctx, "can_restrict_members", () =>
    ctx.api.restrictChatMember(ctx.chat!.id, target.id, MUTED_PERMISSIONS, {
      until_date: Math.floor(Date.now() / 1000) + seconds,
    }),
  );
  if (ok) {
    await ctx.reply(tc(ctx, "mod.muted", { name: target.name, duration: humanDuration(seconds) }), {
      parse_mode: "HTML",
    });
  }
});

moderation.command("unmute", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const ok = await withRights(ctx, "can_restrict_members", () =>
    ctx.api.restrictChatMember(ctx.chat!.id, target.id, UNMUTED_PERMISSIONS),
  );
  if (ok) await ctx.reply(tc(ctx, "mod.unmuted", { name: target.name }), { parse_mode: "HTML" });
});

moderation.command("ban", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const ok = await withRights(ctx, "can_restrict_members", () =>
    ctx.api.banChatMember(ctx.chat!.id, target.id, { revoke_messages: true }),
  );
  if (ok) await ctx.reply(tc(ctx, "mod.banned", { name: target.name }), { parse_mode: "HTML" });
});

moderation.command("unban", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const arg = ctx.match.trim();
  const userId = Number(arg) || targetFromReply(ctx)?.id;
  if (!userId) {
    await ctx.reply(tc(ctx, "mod.unbanUsage"));
    return;
  }
  // only_if_banned is REQUIRED: without it, unbanning an active member kicks them.
  await ctx.api.unbanChatMember(ctx.chat!.id, userId, { only_if_banned: true });
  await ctx.reply(tc(ctx, "mod.unbanned"));
});

moderation.command("kick", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const ok = await withRights(ctx, "can_restrict_members", async () => {
    await ctx.api.banChatMember(ctx.chat!.id, target.id);
    await ctx.api.unbanChatMember(ctx.chat!.id, target.id, { only_if_banned: true });
  });
  if (ok) await ctx.reply(tc(ctx, "mod.kicked", { name: target.name }), { parse_mode: "HTML" });
});

// ---------- admin management (promote / demote / title) ----------

// /promote [custom title] — grant a sensible moderator right set (by reply).
moderation.command("promote", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const chatId = ctx.chat!.id;
  const ok = await withRights(ctx, "can_promote_members", () =>
    ctx.api.promoteChatMember(chatId, target.id, {
      can_delete_messages: true,
      can_restrict_members: true,
      can_invite_users: true,
      can_pin_messages: true,
      can_manage_video_chats: true,
      can_manage_topics: true,
    }),
  );
  if (!ok) return;
  invalidateAdminCache(chatId);
  const title = ctx.match.trim().slice(0, 16);
  if (title) {
    await ctx.api.setChatAdministratorCustomTitle(chatId, target.id, title).catch(() => undefined);
  }
  await ctx.reply(tc(ctx, "mod.promoted", { name: target.name }), { parse_mode: "HTML" });
});

// /demote — remove all admin rights (by reply). Targets ARE admins, so the
// protected-target guard is skipped; Telegram itself refuses when the bot
// didn't promote them or the sender lacks the right.
moderation.command("demote", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const target = targetFromReply(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  if (target.id === ctx.me.id) return;
  const ok = await withRights(ctx, "can_promote_members", () =>
    ctx.api.promoteChatMember(ctx.chat!.id, target.id, {
      is_anonymous: false,
      can_manage_chat: false,
      can_delete_messages: false,
      can_restrict_members: false,
      can_invite_users: false,
      can_pin_messages: false,
      can_manage_video_chats: false,
      can_manage_topics: false,
      can_promote_members: false,
      can_change_info: false,
      can_post_stories: false,
      can_edit_stories: false,
      can_delete_stories: false,
    }),
  );
  if (!ok) return;
  invalidateAdminCache(ctx.chat!.id);
  await ctx.reply(tc(ctx, "mod.demoted", { name: target.name }), { parse_mode: "HTML" });
});

// /title <text> — custom admin title for the replied admin.
moderation.command("title", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const target = targetFromReply(ctx);
  const title = ctx.match.trim().slice(0, 16);
  if (!target || !title) {
    await ctx.reply(tc(ctx, "mod.titleUsage"));
    return;
  }
  const ok = await withRights(ctx, "can_promote_members", () =>
    ctx.api.setChatAdministratorCustomTitle(ctx.chat!.id, target.id, title),
  );
  if (ok) {
    await ctx.reply(tc(ctx, "mod.titleSet", { name: target.name, title: escapeHtml(title) }), {
      parse_mode: "HTML",
    });
  }
});

// ---------- tag / mention ----------

// /tagall [text] — mention recently-active members in small batches.
// Bots cannot enumerate members, so this draws on the ambient log (opt-in).
moderation.command("tagall", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const members = recentMemberIds(ctx.chat!.id, 30).filter((m) => m.user_id !== ctx.from?.id);
  if (!members.length) {
    await ctx.reply(tc(ctx, "tagall.empty"));
    return;
  }
  const note = ctx.match.trim();
  const header = note ? `📢 ${escapeHtml(note)}` : tc(ctx, "tagall.header");
  for (let i = 0; i < members.length; i += 5) {
    const mentions = members
      .slice(i, i + 5)
      .map((m) => `<a href="tg://user?id=${m.user_id}">${escapeHtml(m.name ?? "•")}</a>`)
      .join(" ");
    await ctx
      .reply(i === 0 ? `${header}\n${mentions}` : mentions, {
        parse_mode: "HTML",
        message_thread_id: threadIdOf(ctx),
      })
      .catch(() => undefined);
    // Stay inside Telegram's per-chat rate budget.
    await new Promise((r) => setTimeout(r, 1100));
  }
});

// ---------- cleanup / pin ----------

moderation.command("purge", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const from = ctx.message?.reply_to_message?.message_id;
  const to = ctx.message?.message_id;
  if (!from || !to) {
    await ctx.reply(tc(ctx, "mod.purgeUsage"));
    return;
  }
  const ids: number[] = [];
  for (let id = from; id <= to; id++) ids.push(id);
  for (let i = 0; i < ids.length; i += 100) {
    await ctx.api.deleteMessages(ctx.chat!.id, ids.slice(i, i + 100)).catch(() => undefined);
  }
});

moderation.command("pin", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const target = ctx.message?.reply_to_message?.message_id;
  if (!target) {
    await ctx.reply(tc(ctx, "mod.pinUsage"));
    return;
  }
  await withRights(ctx, "can_pin_messages", () =>
    ctx.api.pinChatMessage(ctx.chat!.id, target, { disable_notification: true }),
  );
});

// ---------- lockdown ----------

moderation.command("lockdown", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const chatId = ctx.chat!.id;
  // Snapshot current defaults BEFORE locking — there is no server-side undo.
  const info = await ctx.api.getChat(chatId);
  updateSettings(chatId, { lockSnapshot: info.permissions ?? UNMUTED_PERMISSIONS });
  const ok = await withRights(ctx, "can_restrict_members", () =>
    ctx.api.setChatPermissions(chatId, MUTED_PERMISSIONS),
  );
  if (ok) await ctx.reply(tc(ctx, "mod.lockdownOn"));
});

moderation.command("unlock", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  // /unlock <type…> lifts content locks; bare /unlock ends a /lockdown.
  if (ctx.match.trim()) {
    const { unlockTypes } = await import("./locks.js");
    if (await unlockTypes(ctx, ctx.match)) return;
  }
  const chatId = ctx.chat!.id;
  const snapshot = getSettings(chatId).lockSnapshot ?? UNMUTED_PERMISSIONS;
  const ok = await withRights(ctx, "can_restrict_members", () =>
    ctx.api.setChatPermissions(chatId, snapshot),
  );
  if (ok) {
    updateSettings(chatId, { lockSnapshot: undefined });
    await ctx.reply(tc(ctx, "mod.lockdownOff"));
  }
});

// ---------- info / report ----------

moderation.command("info", async (ctx) => {
  if (!isGroup(ctx)) return;
  const target = targetFromReply(ctx) ?? (ctx.from ? { id: ctx.from.id, name: escapeHtml(ctx.from.first_name) } : undefined);
  if (!target) return;
  const chatId = ctx.chat!.id;
  const member = await ctx.api.getChatMember(chatId, target.id).catch(() => undefined);
  const warns = getWarns(chatId, target.id);
  const lines = [
    tc(ctx, "mod.infoTitle", { name: target.name }),
    tc(ctx, "mod.infoLine", { id: target.id, status: member?.status ?? "?", warns }),
    tc(ctx, "mod.infoKarma", { karma: getKarma(chatId, target.id) }),
  ];
  if (getAfk(target.id)) lines.push(tc(ctx, "mod.infoAfk"));
  const fed = fedOfChat(chatId);
  if (fed && getFedBan(fed.fed_id, target.id)) lines.push(tc(ctx, "mod.infoFedBanned", { fed: escapeHtml(fed.name) }));
  // Admin-written notes about this user (see /unote) — visible to admins only.
  if (await senderIsAdmin(ctx)) {
    const notes = listUserNotes(chatId, target.id);
    for (const n of notes.slice(0, 3)) lines.push(`📝 ${escapeHtml(n.note)}`);
    if (notes.length > 3) lines.push(`… +${notes.length - 3}`);
  }
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) });
});

// ---------- per-user admin notes ----------

// /unote (reply) <text> — attach a private moderation note to a user.
moderation.command("unote", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const target = targetFromReply(ctx);
  const note = ctx.match.trim();
  if (!target || !note) {
    await ctx.reply(tc(ctx, "unote.usage"));
    return;
  }
  addUserNote(ctx.chat!.id, target.id, note, ctx.from?.first_name);
  await ctx.reply(tc(ctx, "unote.saved", { name: target.name }), { parse_mode: "HTML" });
});

// /unotes (reply) — full note history; /delnotes (reply) — wipe it.
moderation.command("unotes", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const target = targetFromReply(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  const notes = listUserNotes(ctx.chat!.id, target.id);
  if (!notes.length) {
    await ctx.reply(tc(ctx, "unote.empty"));
    return;
  }
  const rows = notes
    .map((n) => `• ${escapeHtml(n.note)}${n.author ? ` — <i>${escapeHtml(n.author)}</i>` : ""}`)
    .join("\n");
  await ctx.reply(`${tc(ctx, "unote.title", { name: target.name })}\n${rows}`, { parse_mode: "HTML" });
});

moderation.command("delnotes", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const target = targetFromReply(ctx);
  if (!target) {
    await ctx.reply(tc(ctx, "error.replyRequired"));
    return;
  }
  deleteUserNotes(ctx.chat!.id, target.id);
  await ctx.reply(tc(ctx, "unote.cleared", { name: target.name }), { parse_mode: "HTML" });
});

async function notifyAdmins(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const admins = await ctx.api.getChatAdministrators(ctx.chat!.id);
  // Silent mentions: text links notify without cluttering the message.
  const mentions = admins
    .filter((a) => !a.user.is_bot)
    .slice(0, 10)
    .map((a) => `<a href="tg://user?id=${a.user.id}">​</a>`)
    .join("");
  await ctx.reply(tc(ctx, "report.body", { name: escapeHtml(ctx.from.first_name) }) + mentions, {
    parse_mode: "HTML",
    reply_parameters: ctx.message?.reply_to_message
      ? { message_id: ctx.message.reply_to_message.message_id }
      : undefined,
  });
}

moderation.command("report", async (ctx) => {
  if (!isGroup(ctx)) return;
  await notifyAdmins(ctx);
});

// Writing "@admin" / "@admins" anywhere in a message calls the admins too —
// the phrasing every Telegram user tries first. Throttled per chat.
const adminCallThrottle = new Map<number, number>();

moderation.on("message:text", async (ctx, next) => {
  if (isGroup(ctx) && ctx.from && !ctx.from.is_bot && /(^|\s)@admins?\b/i.test(ctx.message.text)) {
    const last = adminCallThrottle.get(ctx.chat.id) ?? 0;
    if (Date.now() - last > 60_000) {
      adminCallThrottle.set(ctx.chat.id, Date.now());
      await notifyAdmins(ctx).catch(() => undefined);
    }
  }
  await next();
});

// ---------- channel-persona spam ----------

/** Cached linked_chat_id per group so the linked channel is never banned. */
const linkedChannelCache = new Map<number, { id: number | undefined; at: number }>();

async function linkedChannelId(ctx: Context, chatId: number): Promise<number | undefined> {
  const hit = linkedChannelCache.get(chatId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id;
  const info = await ctx.api.getChat(chatId).catch(() => undefined);
  const id = info?.linked_chat_id;
  linkedChannelCache.set(chatId, { id, at: Date.now() });
  return id;
}

moderation.on("message", async (ctx, next) => {
  const sc = ctx.message?.sender_chat;
  if (
    sc &&
    isGroup(ctx) &&
    sc.id !== ctx.chat!.id && // not an anonymous admin
    !ctx.message?.is_automatic_forward // not the linked channel's feed
  ) {
    const settings = getSettings(ctx.chat!.id);
    if (settings.antiChannelSpam) {
      // Channel admins may comment "as their channel" in a linked discussion
      // group — whitelist the linked channel itself.
      const linked = await linkedChannelId(ctx, ctx.chat!.id);
      if (sc.id !== linked) {
        await ctx.deleteMessage().catch(() => undefined);
        await ctx.api.banChatSenderChat(ctx.chat!.id, sc.id).catch(() => undefined);
        return;
      }
    }
  }
  await next();
});
