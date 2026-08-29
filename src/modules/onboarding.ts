import { Composer, InlineKeyboard, type Context } from "grammy";
import { config } from "../config.js";
import { getSettings, updateSettings, scheduleJob, savePendingJoinQuery } from "../db/repo.js";
import { escapeHtml, humanDuration } from "../util/format.js";
import { renderMemberTemplate, templateNeedsCount, extractButtons } from "../util/placeholders.js";
import { MUTED_PERMISSIONS, UNMUTED_PERMISSIONS } from "../util/permissions.js";
import { isCasBanned } from "../services/cas.js";
import { tc } from "../i18n/index.js";

/**
 * New-member onboarding & anti-abuse gate:
 *  - reliable join detection via chat_member updates
 *  - CAS (Combot Anti-Spam) screening on joins and join requests
 *  - welcome messages, optional button captcha with timeout-kick
 *  - join-request gate verified in DM, incl. Bot API 10.1 guard-bot queries
 *  - raid detection: a join spike auto-locks the group for a cool-down
 */
export const onboarding = new Composer<Context>();

const CAPTCHA_TIMEOUT_S = 5 * 60;
const RAID_WINDOW_MS = 60_000;
const RAID_JOIN_LIMIT = 8;
const RAID_LOCK_S = 30 * 60;

const joinWindow = new Map<number, number[]>();
const raidActive = new Set<number>();

/** Inline URL buttons declared inside a welcome/goodbye template. */
function buttonsKeyboard(buttons: Array<{ label: string; url: string }>): InlineKeyboard | undefined {
  if (!buttons.length) return undefined;
  const kb = new InlineKeyboard();
  for (const b of buttons) kb.url(b.label, b.url).row();
  return kb;
}

async function maybeTriggerRaidMode(ctx: Context, chatId: number): Promise<void> {
  const nowMs = Date.now();
  const joins = (joinWindow.get(chatId) ?? []).filter((t) => nowMs - t < RAID_WINDOW_MS);
  joins.push(nowMs);
  joinWindow.set(chatId, joins);
  if (joins.length <= RAID_JOIN_LIMIT || raidActive.has(chatId)) return;

  raidActive.add(chatId);
  try {
    // Snapshot defaults BEFORE locking — there is no server-side undo.
    const info = await ctx.api.getChat(chatId);
    updateSettings(chatId, { lockSnapshot: info.permissions ?? UNMUTED_PERMISSIONS });
    await ctx.api.setChatPermissions(chatId, MUTED_PERMISSIONS);
    await ctx.api.sendMessage(chatId, tc(ctx, "raid.on", { duration: humanDuration(RAID_LOCK_S) }), {
      parse_mode: "HTML",
    });
    scheduleJob("raid_unlock", { chatId }, RAID_LOCK_S);
  } catch {
    raidActive.delete(chatId); // missing rights — try again on the next spike
  }
  // Allow re-trigger after the lock window.
  setTimeout(() => raidActive.delete(chatId), RAID_LOCK_S * 1000).unref?.();
}

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
  const isIn = newM.status === "member" || (newM.status === "restricted" && newM.is_member);

  // Farewell: only for voluntary leaves — never announce kicks or bans.
  if (wasIn && !isIn && newM.status === "left" && !newM.user.is_bot) {
    const s = getSettings(upd.chat.id);
    if (s.goodbye) {
      let text: string;
      let keyboard: InlineKeyboard | undefined;
      if (s.goodbyeText) {
        const parts = extractButtons(s.goodbyeText);
        text = renderMemberTemplate(parts.text, newM.user, upd.chat);
        keyboard = buttonsKeyboard(parts.buttons);
      } else {
        text = tc(ctx, "goodbye.default", { name: escapeHtml(newM.user.first_name) });
      }
      const msg = await ctx.api
        .sendMessage(upd.chat.id, text, { parse_mode: "HTML", reply_markup: keyboard })
        .catch(() => undefined);
      if (msg) scheduleJob("delete_message", { chatId: upd.chat.id, messageId: msg.message_id }, 300);
    }
    return;
  }
  if (wasIn || !isIn) return;

  const user = newM.user;
  if (user.is_bot) return;
  const settings = getSettings(upd.chat.id);
  const safeName = escapeHtml(user.first_name);

  if (settings.antiraid) void maybeTriggerRaidMode(ctx, upd.chat.id);

  // CAS screening: known spammers are removed immediately (soft-ban → unban,
  // so a false positive can still rejoin after appeal).
  if (await isCasBanned(user.id)) {
    try {
      await ctx.api.banChatMember(upd.chat.id, user.id);
      await ctx.api.unbanChatMember(upd.chat.id, user.id, { only_if_banned: true });
      const msg = await ctx.api.sendMessage(upd.chat.id, tc(ctx, "cas.blocked", { name: safeName }), {
        parse_mode: "HTML",
      });
      scheduleJob("delete_message", { chatId: upd.chat.id, messageId: msg.message_id }, 120);
    } catch {
      /* missing rights — fall through to normal flow */
    }
    return;
  }

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
    // Templates support the full Rose-style placeholder set plus inline URL
    // buttons ([Label](https://…)); everything is escaped inside
    // renderMemberTemplate, so user text can't inject HTML.
    let text: string;
    let keyboard: InlineKeyboard | undefined;
    if (settings.welcomeText) {
      const parts = extractButtons(settings.welcomeText);
      const count = templateNeedsCount(parts.text)
        ? await ctx.api.getChatMemberCount(upd.chat.id).catch(() => undefined)
        : undefined;
      text = renderMemberTemplate(parts.text, user, upd.chat, count);
      keyboard = buttonsKeyboard(parts.buttons);
    } else {
      text = tc(ctx, "welcome.default", { name: safeName });
    }
    const msg = await ctx.api
      .sendMessage(upd.chat.id, text, { parse_mode: "HTML", reply_markup: keyboard })
      .catch(() => ctx.api.sendMessage(upd.chat.id, text.replace(/<[^>]+>/g, ""), { reply_markup: keyboard }));
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

/**
 * Join-request gate. Two flows share this handler:
 *  - classic: DM the applicant inside the 5-minute user_chat_id window,
 *    approve when they tap the button;
 *  - guard-bot (Bot API 10.1): the request carries a query_id that MUST be
 *    answered within 10 seconds — decline CAS-listed users instantly,
 *    otherwise 'queue' so human admins + the DM flow keep working.
 */
onboarding.on("chat_join_request", async (ctx) => {
  const req = ctx.chatJoinRequest;
  const queryId = (req as { query_id?: string }).query_id;
  const banned = await isCasBanned(req.from.id);

  if (queryId) {
    // grammY's raw API is a proxy: any method name is forwarded to the wire,
    // so this stays valid even where local typings trail the live Bot API.
    const raw = ctx.api.raw as unknown as Record<string, (p: unknown) => Promise<unknown>>;
    if (!banned && config.webappUrl) {
      // Preferred: show the self-hosted Mini App captcha. The query id stays
      // server-side; /captcha/verify resolves it after initData validation.
      savePendingJoinQuery(req.from.id, req.chat.id, queryId);
      const shown = await raw
        .sendChatJoinRequestWebApp!({
          chat_join_request_query_id: queryId,
          web_app_url: `${config.webappUrl}/captcha`,
        })
        .then(() => true)
        .catch(() => false);
      if (shown) return; // Mini App flow owns this request now
    }
    await raw
      .answerChatJoinRequestQuery!({
        chat_join_request_query_id: queryId,
        result: banned ? "decline" : "queue",
      })
      .catch(() => undefined);
  }
  if (banned) {
    await ctx.api.declineChatJoinRequest(req.chat.id, req.from.id).catch(() => undefined);
    return;
  }

  const kb = new InlineKeyboard().text(tc(ctx, "join.dmButton"), `joinreq:${req.chat.id}`);
  await ctx.api
    .sendMessage(req.user_chat_id, tc(ctx, "join.dmPrompt", { chat: escapeHtml(req.chat.title ?? "group") }), {
      parse_mode: "HTML",
      reply_markup: kb,
    })
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
