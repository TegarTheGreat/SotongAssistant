import { Composer, type Context } from "grammy";
import type { InputPaidMedia } from "grammy/types";
import { config } from "../config.js";
import { senderIsAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * Telegram Stars support: /donate sends an XTR invoice (empty provider token,
 * single price item), the pre-checkout is auto-approved, and the owner can
 * refund a payment by replying /refund to the "thank you" receipt message.
 */
export const stars = new Composer<Context>();

stars.command("donate", async (ctx) => {
  const amount = Math.min(Math.max(Number(ctx.match.trim()) || 25, 1), 10_000);
  await ctx.replyWithInvoice(
    tc(ctx, "stars.donateTitle", { bot: ctx.me.first_name }),
    tc(ctx, "stars.donateDesc"),
    `donate:${ctx.from?.id ?? 0}`,
    "XTR",
    [{ label: "⭐", amount }],
  );
});

stars.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true));

stars.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  await ctx.reply(
    tc(ctx, "stars.thanks", {
      name: escapeHtml(ctx.from?.first_name ?? "?"),
      amount: payment.total_amount,
    }) + `\n<code>${payment.telegram_payment_charge_id}</code>`,
    { parse_mode: "HTML" },
  );
});

/**
 * /paidpost <stars> — reply to a photo or video to repost it as PAID MEDIA:
 * viewers unlock it by paying the given amount of Telegram Stars.
 * Works in channels and groups (admins).
 */
stars.command("paidpost", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply(tc(ctx, "paid.usage"));
    return;
  }
  const isChannel = ctx.chat.type === "channel";
  if (!isChannel && !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const replied = ctx.msg?.reply_to_message;
  const amount = Number(ctx.match.trim());
  let media: InputPaidMedia | undefined;
  if (replied?.photo?.length) {
    media = { type: "photo", media: replied.photo[replied.photo.length - 1]!.file_id };
  } else if (replied?.video) {
    media = { type: "video", media: replied.video.file_id };
  }
  if (!media || !Number.isInteger(amount) || amount < 1 || amount > 10_000) {
    await ctx.reply(tc(ctx, "paid.usage"));
    return;
  }
  try {
    await ctx.api.sendPaidMedia(ctx.chat.id, amount, [media], {
      caption: replied?.caption?.slice(0, 1024),
    });
    // The originals stay visible to admins — remove them so only the paid
    // version remains for members.
    await ctx.api.deleteMessage(ctx.chat.id, replied!.message_id).catch(() => undefined);
    await ctx.deleteMessage().catch(() => undefined);
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message }));
  }
});

/**
 * /subscription — monthly Telegram Stars subscription invite link.
 * Telegram only supports these on CHANNELS, with a fixed 30-day period.
 * Use it inside the channel (/subscription <stars>) or from the owner's DM
 * with an explicit channel id (/subscription <channel_id> <stars>).
 */
stars.command("subscription", async (ctx) => {
  const parts = ctx.match.trim().split(/\s+/).filter(Boolean);
  let chatId: number | undefined;
  let amount: number;
  if (ctx.chat.type === "channel") {
    chatId = ctx.chat.id;
    amount = Number(parts[0]);
  } else if (ctx.chat.type === "private") {
    if (ctx.from?.id !== config.ownerId) {
      await ctx.reply(tc(ctx, "error.ownerOnly"));
      return;
    }
    chatId = Number(parts[0]);
    amount = Number(parts[1]);
  } else {
    await ctx.reply(tc(ctx, "sub.channelOnly"), { parse_mode: "HTML" });
    return;
  }
  if (!chatId || !Number.isInteger(amount) || amount < 1 || amount > 10_000) {
    await ctx.reply(tc(ctx, "sub.usage"));
    return;
  }
  try {
    // 2592000s = 30 days — the only period Telegram accepts.
    const link = await ctx.api.createChatSubscriptionInviteLink(chatId, 2_592_000, amount);
    await ctx.reply(tc(ctx, "sub.link", { amount, link: link.invite_link }));
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message }));
  }
});

// /balance — owner only: the bot's Star balance plus its latest transactions.
stars.command("balance", async (ctx) => {
  if (ctx.from?.id !== config.ownerId) {
    await ctx.reply(tc(ctx, "error.ownerOnly"));
    return;
  }
  try {
    const bal = await ctx.api.getMyStarBalance();
    const tx = await ctx.api.getStarTransactions({ limit: 5 }).catch(() => undefined);
    const rows = (tx?.transactions ?? [])
      .map((t) => `• ${t.amount > 0 ? "+" : ""}${t.amount} ⭐ — <code>${escapeHtml(t.id.slice(0, 16))}</code>`)
      .join("\n");
    await ctx.reply(tc(ctx, "stars.balance", { amount: bal.amount }) + (rows ? `\n\n${rows}` : ""), {
      parse_mode: "HTML",
    });
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message.slice(0, 150) }));
  }
});

// /gifts — the gift catalogue Telegram currently offers, cheapest first.
stars.command("gifts", async (ctx) => {
  try {
    const list = await ctx.api.getAvailableGifts();
    const rows = [...list.gifts]
      .sort((a, b) => a.star_count - b.star_count)
      .slice(0, 12)
      .map((g) => `${g.sticker.emoji ?? "🎁"} <code>${g.id}</code> — ${g.star_count} ⭐`)
      .join("\n");
    await ctx.reply(rows ? `${tc(ctx, "gift.list")}\n${rows}` : tc(ctx, "gift.none"), { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message.slice(0, 150) }));
  }
});

// /gift <gift_id> — send a gift to the replied user, paid from the bot's Stars.
stars.command("gift", async (ctx) => {
  if (ctx.from?.id !== config.ownerId) {
    await ctx.reply(tc(ctx, "error.ownerOnly"));
    return;
  }
  const target = ctx.message?.reply_to_message?.from;
  const giftId = ctx.match.trim();
  if (!target || target.is_bot || !giftId) {
    await ctx.reply(tc(ctx, "gift.usage"));
    return;
  }
  try {
    await ctx.api.sendGift(target.id, giftId, { text: `From ${ctx.me.first_name} 🦑` });
    await ctx.reply(tc(ctx, "gift.sent", { name: escapeHtml(target.first_name) }), { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message.slice(0, 150) }));
  }
});

// /refund (owner, replying to the receipt that contains the charge id)
stars.command("refund", async (ctx) => {
  if (ctx.from?.id !== config.ownerId) {
    await ctx.reply(tc(ctx, "error.ownerOnly"));
    return;
  }
  const replied = ctx.message?.reply_to_message;
  const chargeId =
    ctx.match.trim() ||
    replied?.text?.match(/[A-Za-z0-9_-]{20,}/)?.[0] ||
    replied?.successful_payment?.telegram_payment_charge_id;
  const userId = replied?.successful_payment ? replied.from?.id : Number(ctx.match.split(/\s+/)[1]);
  if (!chargeId) {
    await ctx.reply("Usage: /refund <charge_id> (or reply to the receipt)");
    return;
  }
  try {
    await ctx.api.refundStarPayment(userId ?? ctx.from.id, chargeId);
    await ctx.reply("✅ Refunded.");
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message }));
  }
});
