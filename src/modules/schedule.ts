import { Composer, type Context } from "grammy";
import { getSettings, scheduleJob, listJobsByKind, deleteJob } from "../db/repo.js";
import { senderIsAdmin } from "../util/admin.js";
import { parseDuration, humanDuration, escapeHtml } from "../util/format.js";
import { localMinutes, parseHHMM } from "../util/time.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * One-off scheduled messages, in the chat's own timezone (/settz):
 *   /schedule 18:00 Meeting starts! · /schedule 45m Stretch break
 *   /schedules — list · /unschedule <id> — cancel
 * Delivery rides the durable job queue, so restarts don't lose anything.
 */
export const schedule = new Composer<Context>();

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

schedule.command("schedule", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const [when, ...rest] = ctx.match.trim().split(/\s+/);
  const text = rest.join(" ");
  const tz = getSettings(ctx.chat.id).timezone;
  let seconds: number | undefined;
  const clock = when ? parseHHMM(when) : undefined;
  if (clock !== undefined) {
    // Next occurrence of HH:MM in the chat's local time (today or tomorrow).
    const delta = (clock - localMinutes(tz) + 1440) % 1440 || 1440;
    seconds = delta * 60;
  } else {
    seconds = parseDuration(when);
  }
  if (!seconds || !text) {
    await ctx.reply(tc(ctx, "schedule.usage", { tz: tz ?? "UTC" }));
    return;
  }
  scheduleJob("say", { chatId: ctx.chat.id, text: text.slice(0, 3500), threadId: threadIdOf(ctx) }, seconds);
  await ctx.reply(tc(ctx, "schedule.set", { duration: humanDuration(seconds) }));
});

schedule.command("schedules", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const jobs = listJobsByKind("say").filter(
    (j) => (JSON.parse(j.payload) as { chatId: number }).chatId === ctx.chat.id,
  );
  if (!jobs.length) {
    await ctx.reply(tc(ctx, "schedule.none"));
    return;
  }
  const nowS = Math.floor(Date.now() / 1000);
  const rows = jobs
    .map((j) => {
      const p = JSON.parse(j.payload) as { text: string };
      return `• <code>${j.id}</code> — ${humanDuration(Math.max(60, j.due_at - nowS))}: ${escapeHtml(p.text.slice(0, 60))}`;
    })
    .join("\n");
  await ctx.reply(`${tc(ctx, "schedule.list")}\n${rows}`, { parse_mode: "HTML" });
});

schedule.command("unschedule", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const id = Number(ctx.match.trim());
  const mine = listJobsByKind("say").some(
    (j) => j.id === id && (JSON.parse(j.payload) as { chatId: number }).chatId === ctx.chat.id,
  );
  await ctx.reply(tc(ctx, mine && deleteJob(id) ? "schedule.removed" : "schedule.none"));
});

// ---------- recurring AI prompts ----------

/**
 * /aitask 09:00 Ask the team for a one-line standup update
 * /aitask 6h Share a short productivity tip
 * The model regenerates the text on every run, so the group never sees the
 * same message twice. HH:MM anchors the first run to the chat's local time
 * and then repeats daily; a duration repeats on that interval.
 */
schedule.command("aitask", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const [when, ...rest] = ctx.match.trim().split(/\s+/);
  const prompt = rest.join(" ");
  const tz = getSettings(ctx.chat.id).timezone;
  const clock = when ? parseHHMM(when) : undefined;
  const firstDelay =
    clock !== undefined
      ? ((clock - localMinutes(tz) + 1440) % 1440 || 1440) * 60
      : parseDuration(when);
  const repeat = clock !== undefined ? 86400 : firstDelay;
  if (!firstDelay || !repeat || repeat < 3600 || prompt.length < 4) {
    await ctx.reply(tc(ctx, "aitask.usage", { tz: tz ?? "UTC" }));
    return;
  }
  scheduleJob(
    "ai_prompt",
    { chatId: ctx.chat.id, threadId: threadIdOf(ctx), prompt: prompt.slice(0, 1000), repeatSeconds: repeat },
    firstDelay,
  );
  await ctx.reply(
    tc(ctx, "aitask.set", { first: humanDuration(firstDelay), every: humanDuration(repeat) }),
  );
});

schedule.command("aitasks", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const jobs = listJobsByKind("ai_prompt").filter(
    (j) => (JSON.parse(j.payload) as { chatId: number }).chatId === ctx.chat.id,
  );
  if (!jobs.length) {
    await ctx.reply(tc(ctx, "aitask.none"));
    return;
  }
  const rows = jobs
    .map((j) => {
      const p = JSON.parse(j.payload) as { prompt: string; repeatSeconds?: number };
      return `• <code>${j.id}</code> — ${humanDuration(p.repeatSeconds ?? 86400)}: ${escapeHtml(p.prompt.slice(0, 60))}`;
    })
    .join("\n");
  await ctx.reply(`${tc(ctx, "aitask.list")}\n${rows}`, { parse_mode: "HTML" });
});

schedule.command("unaitask", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const id = Number(ctx.match.trim());
  const mine = listJobsByKind("ai_prompt").some(
    (j) => j.id === id && (JSON.parse(j.payload) as { chatId: number }).chatId === ctx.chat.id,
  );
  await ctx.reply(tc(ctx, mine && deleteJob(id) ? "aitask.removed" : "aitask.none"));
});
