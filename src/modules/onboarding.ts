import { Composer, InlineKeyboard, type Context } from "grammy";
import { getSettings, scheduleJob } from "../db/index.js";
import { escapeHtml } from "../util/format.js";

/**
 * Onboarding member baru: deteksi join via chat_member (sinyal andal),
 * welcome message, captcha tombol opsional, dan gerbang join request.
 */
export const onboarding = new Composer<Context>();

const CAPTCHA_TIMEOUT_S = 5 * 60;

const MUTED = {
  can_send_messages: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
};
const UNMUTED = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
};

onboarding.on("chat_member", async (ctx) => {
  const upd = ctx.chatMember;
  const oldIn = ["member", "administrator", "creator", "restricted"].includes(upd.old_chat_member.status);
  const newIn = ["member", "restricted"].includes(upd.new_chat_member.status);
  const joined =
    !oldIn && newIn && (upd.new_chat_member.status !== "restricted" || upd.new_chat_member.is_member);
  if (!joined) return;

  const user = upd.new_chat_member.user;
  if (user.is_bot) return;
  const settings = getSettings(upd.chat.id);

  if (settings.captcha) {
    // mute dulu, buka setelah menekan tombol; kick bila lewat batas waktu
    await ctx.api
      .restrictChatMember(upd.chat.id, user.id, MUTED, {
        until_date: Math.floor(Date.now() / 1000) + CAPTCHA_TIMEOUT_S + 60,
      })
      .catch(() => undefined);
    const kb = new InlineKeyboard().text("✅ Saya manusia", `captcha:${user.id}`);
    const msg = await ctx.api.sendMessage(
      upd.chat.id,
      `👋 Halo <b>${escapeHtml(user.first_name)}</b>! Tekan tombol di bawah dalam 5 menit untuk mulai mengobrol.`,
      { parse_mode: "HTML", reply_markup: kb },
    );
    scheduleJob(
      "kick_unverified",
      { chatId: upd.chat.id, userId: user.id, messageId: msg.message_id },
      CAPTCHA_TIMEOUT_S,
    );
    return;
  }

  if (settings.welcome) {
    const text =
      settings.welcomeText?.replaceAll("{name}", user.first_name) ??
      `👋 Selamat datang, <b>${escapeHtml(user.first_name)}</b>!`;
    const msg = await ctx.api.sendMessage(upd.chat.id, text, { parse_mode: "HTML" });
    // rapikan: hapus welcome setelah 5 menit
    scheduleJob("delete_message", { chatId: upd.chat.id, messageId: msg.message_id }, 300);
  }
});

onboarding.callbackQuery(/^captcha:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  // siapa pun bisa memencet tombol — pastikan yang menekan adalah yang ditantang
  if (ctx.from.id !== targetId) {
    await ctx.answerCallbackQuery({ text: "Tombol ini bukan untukmu 🙂", show_alert: false });
    return;
  }
  await ctx.api.restrictChatMember(ctx.chat!.id, targetId, UNMUTED).catch(() => undefined);
  await ctx.deleteMessage().catch(() => undefined);
  await ctx.answerCallbackQuery({ text: "Selamat bergabung! 🎉" });
});

// Gerbang join request (grup join-by-request / link creates_join_request):
// verifikasi via DM (jendela 5 menit user_chat_id), lalu approve saat tombol ditekan.
onboarding.on("chat_join_request", async (ctx) => {
  const req = ctx.chatJoinRequest;
  const kb = new InlineKeyboard().text("✅ Verifikasi & gabung", `joinreq:${req.chat.id}`);
  await ctx.api
    .sendMessage(
      req.user_chat_id,
      `Kamu meminta bergabung ke <b>${escapeHtml(req.chat.title ?? "grup")}</b>.\nTekan tombol untuk verifikasi:`,
      { parse_mode: "HTML", reply_markup: kb },
    )
    .catch(() => undefined); // jendela DM 5 menit bisa saja lewat
});

onboarding.callbackQuery(/^joinreq:(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  try {
    await ctx.api.approveChatJoinRequest(chatId, ctx.from.id);
    await ctx.editMessageText("✅ Diterima — selamat bergabung!");
  } catch {
    await ctx.editMessageText("Permintaan join sudah tidak berlaku.");
  }
  await ctx.answerCallbackQuery();
});
