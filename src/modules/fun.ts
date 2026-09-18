import { Composer, type Context } from "grammy";
import { scheduleJob } from "../db/repo.js";
import { parseDuration, humanDuration, escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/** Games, polls, quizzes and reminders — the engagement toolkit. */
export const fun = new Composer<Context>();

fun.command("dice", (ctx) => ctx.replyWithDice("🎲", { message_thread_id: threadIdOf(ctx) }));
fun.command("darts", (ctx) => ctx.replyWithDice("🎯", { message_thread_id: threadIdOf(ctx) }));
fun.command("slot", (ctx) => ctx.replyWithDice("🎰", { message_thread_id: threadIdOf(ctx) }));

fun.command("coin", async (ctx) => {
  await ctx.reply(Math.random() < 0.5 ? "🪙 Heads" : "🪙 Tails", {
    message_thread_id: threadIdOf(ctx),
  });
});

// /poll Question | Option 1 | Option 2 …
fun.command("poll", async (ctx) => {
  const parts = ctx.match.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) {
    await ctx.reply(tc(ctx, "fun.pollUsage"));
    return;
  }
  const [question, ...options] = parts;
  await ctx.replyWithPoll(question!.slice(0, 300), options.slice(0, 10).map((o) => ({ text: o.slice(0, 100) })), {
    is_anonymous: true,
    message_thread_id: threadIdOf(ctx),
  });
});

// /quiz Question | Correct | Wrong 1 | Wrong 2 … (options are shuffled)
fun.command("quiz", async (ctx) => {
  const parts = ctx.match.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) {
    await ctx.reply(tc(ctx, "fun.quizUsage"));
    return;
  }
  const [question, correct, ...wrong] = parts;
  const options = [correct!, ...wrong].slice(0, 10);
  const order = options
    .map((text, i) => ({ text, i }))
    .sort(() => Math.random() - 0.5);
  const correctIndex = order.findIndex((o) => o.i === 0);
  await ctx.replyWithPoll(question!.slice(0, 300), order.map((o) => ({ text: o.text.slice(0, 100) })), {
    type: "quiz",
    correct_option_ids: [correctIndex],
    is_anonymous: false,
    message_thread_id: threadIdOf(ctx),
  });
});

// /remind 10m Take a break
fun.command("remind", async (ctx) => {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(ctx.match.trim());
  const seconds = parseDuration(m?.[1]);
  if (!m || !seconds) {
    await ctx.reply(tc(ctx, "remind.usage"));
    return;
  }
  const mention = ctx.from
    ? `<a href="tg://user?id=${ctx.from.id}">${escapeHtml(ctx.from.first_name)}</a>`
    : "";
  scheduleJob(
    "reminder",
    { chatId: ctx.chat.id, text: tc(ctx, "remind.fire", { mention, text: escapeHtml(m[2]!) }) },
    seconds,
  );
  await ctx.reply(tc(ctx, "remind.set", { duration: humanDuration(seconds) }), {
    message_thread_id: threadIdOf(ctx),
  });
});
