import { Composer, type Context } from "grammy";
import { addWarn, clearWarns, getSettings } from "../db/index.js";
import { senderIsAdmin, isProtectedTarget } from "../util/admin.js";
import { parseDuration, escapeHtml } from "../util/format.js";

export const moderation = new Composer<Context>();

const MUTE_PERMISSIONS = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
};

const UNMUTE_PERMISSIONS = Object.fromEntries(
  Object.keys(MUTE_PERMISSIONS).map((k) => [k, true]),
) as Record<keyof typeof MUTE_PERMISSIONS, boolean>;

/** Ambil target dari reply. Menolak persona channel & auto-forward (tidak ada user_id). */
function targetFromReply(ctx: Context): { id: number; name: string } | undefined {
  const r = ctx.message?.reply_to_message;
  if (!r) return undefined;
  if (r.sender_chat || !r.from) return undefined;
  return { id: r.from.id, name: r.from.first_name };
}

function onlyGroups(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

async function guard(ctx: Context): Promise<{ id: number; name: string } | undefined> {
  if (!onlyGroups(ctx)) {
    await ctx.reply("Perintah ini hanya untuk grup.");
    return undefined;
  }
  if (!(await senderIsAdmin(ctx))) {
    await ctx.reply("Hanya admin yang boleh memakai perintah ini.");
    return undefined;
  }
  const target = targetFromReply(ctx);
  if (!target) {
    await ctx.reply("Balas (reply) pesan orang yang dimaksud, lalu kirim perintahnya.");
    return undefined;
  }
  if (await isProtectedTarget(ctx, target.id)) {
    await ctx.reply("Target adalah admin/bot ini — tidak bisa dikenai aksi.");
    return undefined;
  }
  return target;
}

moderation.command("warn", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const count = addWarn(ctx.chat!.id, target.id);
  const { warnLimit } = getSettings(ctx.chat!.id);
  if (count >= warnLimit) {
    clearWarns(ctx.chat!.id, target.id);
    const until = Math.floor(Date.now() / 1000) + 24 * 3600;
    await ctx.api.restrictChatMember(ctx.chat!.id, target.id, MUTE_PERMISSIONS, {
      until_date: until,
    });
    await ctx.reply(
      `🔇 <b>${escapeHtml(target.name)}</b> mencapai ${count}/${warnLimit} peringatan → mute 24 jam.`,
      { parse_mode: "HTML" },
    );
  } else {
    await ctx.reply(
      `⚠️ <b>${escapeHtml(target.name)}</b> diberi peringatan (${count}/${warnLimit}).`,
      { parse_mode: "HTML" },
    );
  }
});

moderation.command("unwarn", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  clearWarns(ctx.chat!.id, target.id);
  await ctx.reply(`✅ Peringatan ${escapeHtml(target.name)} dihapus.`, { parse_mode: "HTML" });
});

moderation.command("mute", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  const seconds = parseDuration(ctx.match.trim()) ?? 3600;
  await ctx.api.restrictChatMember(ctx.chat!.id, target.id, MUTE_PERMISSIONS, {
    until_date: Math.floor(Date.now() / 1000) + seconds,
  });
  await ctx.reply(
    `🔇 ${escapeHtml(target.name)} dibisukan ${Math.round(seconds / 60)} menit. (Telegram yang mengangkatnya otomatis — tahan restart bot.)`,
    { parse_mode: "HTML" },
  );
});

moderation.command("unmute", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  await ctx.api.restrictChatMember(ctx.chat!.id, target.id, UNMUTE_PERMISSIONS);
  await ctx.reply(`🔊 ${escapeHtml(target.name)} bisa bicara lagi.`, { parse_mode: "HTML" });
});

moderation.command("ban", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  await ctx.api.banChatMember(ctx.chat!.id, target.id, { revoke_messages: true });
  await ctx.reply(`🔨 ${escapeHtml(target.name)} diban dan seluruh pesannya dihapus.`, {
    parse_mode: "HTML",
  });
});

moderation.command("unban", async (ctx) => {
  if (!onlyGroups(ctx) || !(await senderIsAdmin(ctx))) return;
  const arg = ctx.match.trim();
  const userId = Number(arg) || targetFromReply(ctx)?.id;
  if (!userId) {
    await ctx.reply("Pakai: /unban <user_id> atau reply pesan lamanya.");
    return;
  }
  // only_if_banned WAJIB — tanpa ini, unban terhadap member aktif malah menendangnya
  await ctx.api.unbanChatMember(ctx.chat!.id, userId, { only_if_banned: true });
  await ctx.reply("✅ Unban selesai (kalau memang sedang diban).");
});

moderation.command("kick", async (ctx) => {
  const target = await guard(ctx);
  if (!target) return;
  await ctx.api.banChatMember(ctx.chat!.id, target.id);
  await ctx.api.unbanChatMember(ctx.chat!.id, target.id, { only_if_banned: true });
  await ctx.reply(`👢 ${escapeHtml(target.name)} dikeluarkan (boleh join lagi).`, {
    parse_mode: "HTML",
  });
});

// /purge — hapus dari pesan yang di-reply sampai pesan perintah (batch deleteMessages)
moderation.command("purge", async (ctx) => {
  if (!onlyGroups(ctx) || !(await senderIsAdmin(ctx))) return;
  const from = ctx.message?.reply_to_message?.message_id;
  const to = ctx.message?.message_id;
  if (!from || !to) {
    await ctx.reply("Reply pesan awal yang mau dihapus, lalu kirim /purge.");
    return;
  }
  const ids: number[] = [];
  for (let id = from; id <= to; id++) ids.push(id);
  for (let i = 0; i < ids.length; i += 100) {
    await ctx.api.deleteMessages(ctx.chat!.id, ids.slice(i, i + 100)).catch(() => undefined);
  }
});

// /pin — reply pesan lalu /pin
moderation.command("pin", async (ctx) => {
  if (!onlyGroups(ctx) || !(await senderIsAdmin(ctx))) return;
  const target = ctx.message?.reply_to_message?.message_id;
  if (!target) {
    await ctx.reply("Reply pesan yang mau di-pin.");
    return;
  }
  await ctx.api.pinChatMessage(ctx.chat!.id, target, { disable_notification: true });
});

// spam berkedok channel (sender_chat asing) → ban persona channel-nya bila diaktifkan
moderation.on("message", async (ctx, next) => {
  const sc = ctx.message?.sender_chat;
  if (
    sc &&
    onlyGroups(ctx) &&
    sc.id !== ctx.chat!.id && // bukan admin anonim
    !ctx.message?.is_automatic_forward // bukan feed channel tertaut
  ) {
    const settings = getSettings(ctx.chat!.id);
    if (settings.antiChannelSpam) {
      await ctx.deleteMessage().catch(() => undefined);
      await ctx.api.banChatSenderChat(ctx.chat!.id, sc.id).catch(() => undefined);
      return;
    }
  }
  await next();
});
