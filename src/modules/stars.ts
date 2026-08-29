import { Composer, type Context } from "grammy";
import { config } from "../config.js";
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
