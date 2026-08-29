import { Composer, type Context } from "grammy";
import { addWarn, clearWarns, getWarns, getSettings, updateSettings } from "../db/repo.js";
import { senderIsAdmin, isProtectedTarget } from "../util/admin.js";
import { parseDuration, humanDuration, escapeHtml } from "../util/format.js";
import { MUTED_PERMISSIONS, UNMUTED_PERMISSIONS } from "../util/permissions.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

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
  // Escalate: mute first, and only clear the counter after the mute succeeded —
  // otherwise a rights failure would silently reset the offender to zero warns.
  const until = Math.floor(Date.now() / 1000) + 24 * 3600;
  const ok = await withRights(ctx, "can_restrict_members", () =>
    ctx.api.restrictChatMember(chatId, target.id, MUTED_PERMISSIONS, { until_date: until }),
  );
  if (!ok) return;
  clearWarns(chatId, target.id);
  await ctx.reply(tc(ctx, "mod.warnEscalated", { name: target.name, count, limit: warnLimit }), {
    parse_mode: "HTML",
  });
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
  const member = await ctx.api.getChatMember(ctx.chat!.id, target.id).catch(() => undefined);
  const warns = getWarns(ctx.chat!.id, target.id);
  await ctx.reply(
    `${tc(ctx, "mod.infoTitle", { name: target.name })}\n` +
      tc(ctx, "mod.infoLine", { id: target.id, status: member?.status ?? "?", warns }),
    { parse_mode: "HTML", message_thread_id: threadIdOf(ctx) },
  );
});

moderation.command("report", async (ctx) => {
  if (!isGroup(ctx) || !ctx.from) return;
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
