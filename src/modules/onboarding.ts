import { Composer, InlineKeyboard, type Context } from "grammy";
import { getSettings, scheduleJob } from "../db/repo.js";
import { escapeHtml } from "../util/format.js";
import { MUTED_PERMISSIONS, UNMUTED_PERMISSIONS } from "../util/permissions.js";
import { tc } from "../i18n/index.js";

/**
 * New-member onboarding: reliable join detection via chat_member updates,
 * welcome messages, an optional button captcha, and a join-request gate.
 */
export const onboarding = new Composer<Context>();

const CAPTCHA_TIMEOUT_S = 5 * 60;

onboarding.on("chat_member", async (ctx) => {
  const upd = ctx.chatMember;
  // Groups/supergroups only — in channels a "join" is just a subscriber, and
  // posting welcome messages there would spam the channel feed.
  if (upd.chat.type !== "group" && upd.chat.type !== "supergroup") return;

  const oldM = upd.old_chat_member;
  const newM = upd.new_chat_member;
  // "Was in the chat" must respect restricted.is_member: a muted user who left
  // still has status 'restricted' — without this check, rejoining them would
  // silently skip the captcha.
  const wasIn =
    ["member", "administrator", "creator"].includes(oldM.status) ||
    (oldM.status === "restricted" && oldM.is_member);
  const isIn =
    newM.status === "member" || (newM.status === "restricted" && newM.is_member);
  if (wasIn || !isIn) return;

  const user = newM.user;
  if (user.is_bot) return;
  const settings = getSettings(upd.chat.id);
  const safeName = escapeHtml(user.first_name);

  if (settings.captcha) {
    // Mute until the button is pressed; the scheduled job kicks on timeout.
    await ctx.api
      .restrictChatMember(upd.chat.id, user.id, MUTED_PERMISSIONS, {
        until_date: Math.floor(Date.now() / 1000) + CAPTCHA_TIMEOUT_S + 60,
      })
      .catch(() => undefined);
    const kb = new InlineKeyboard().text(tc(ctx, "captcha.button"), `captcha:${user.id}`);
    const msg = await ctx.api.sendMessage(upd.chat.id, tc(ctx, "captcha.prompt", { name: safeName }), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    scheduleJob(
      "kick_unverified",
      { chatId: upd.chat.id, userId: user.id, messageId: msg.message_id },
      CAPTCHA_TIMEOUT_S,
    );
    return;
  }

  if (settings.welcome) {
    // Custom welcome text is admin-authored; the member name is escaped and the
    // custom text is sent as-is only through OUR formatting (never raw HTML from
    // the name). A malformed custom text falls back to plain text.
    const text = settings.welcomeText
      ? escapeHtml(settings.welcomeText).replaceAll("{name}", `<b>${safeName}</b>`)
      : tc(ctx, "welcome.default", { name: safeName });
    const msg = await ctx.api
      .sendMessage(upd.chat.id, text, { parse_mode: "HTML" })
      .catch(() => ctx.api.sendMessage(upd.chat.id, text.replace(/<[^>]+>/g, "")));
    // Keep the group tidy: auto-delete the welcome after 5 minutes.
    scheduleJob("delete_message", { chatId: upd.chat.id, messageId: msg.message_id }, 300);
  }
});

onboarding.callbackQuery(/^captcha:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  // Anyone can press an inline button — only the challenged user may pass.
  if (ctx.from.id !== targetId) {
    await ctx.answerCallbackQuery({ text: tc(ctx, "captcha.notForYou") });
    return;
  }
  await ctx.api.restrictChatMember(ctx.chat!.id, targetId, UNMUTED_PERMISSIONS).catch(() => undefined);
  await ctx.deleteMessage().catch(() => undefined);
  await ctx.answerCallbackQuery({ text: tc(ctx, "captcha.passed") });
});

// Join-request gate (join-by-request groups / creates_join_request links):
// verify via DM inside the 5-minute user_chat_id window, approve on tap.
onboarding.on("chat_join_request", async (ctx) => {
  const req = ctx.chatJoinRequest;
  const kb = new InlineKeyboard().text(tc(ctx, "join.dmButton"), `joinreq:${req.chat.id}`);
  await ctx.api
    .sendMessage(
      req.user_chat_id,
      tc(ctx, "join.dmPrompt", { chat: escapeHtml(req.chat.title ?? "group") }),
      { parse_mode: "HTML", reply_markup: kb },
    )
    .catch(() => undefined); // the 5-minute DM window may have passed
});

onboarding.callbackQuery(/^joinreq:(-?\d+)$/, async (ctx) => {
  const chatId = Number(ctx.match[1]);
  try {
    await ctx.api.approveChatJoinRequest(chatId, ctx.from.id);
    await ctx.editMessageText(tc(ctx, "join.approved"));
  } catch {
    await ctx.editMessageText(tc(ctx, "join.expired"));
  }
  await ctx.answerCallbackQuery();
});
