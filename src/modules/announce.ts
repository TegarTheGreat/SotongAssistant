import { Composer, type Context } from "grammy";
import { scheduleJob, listJobsByKind, deleteJob } from "../db/repo.js";
import { parseDuration, humanDuration, escapeHtml } from "../util/format.js";
import { senderIsAdmin } from "../util/admin.js";
import { tc } from "../i18n/index.js";

/**
 * Recurring announcements, backed by the durable job queue:
 * /announce 6h Text → posts every 6 hours, surviving restarts.
 */
export const announce = new Composer<Context>();

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

announce.command("announce", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const m = /^(\S+)\s+([\s\S]+)$/.exec(ctx.match.trim());
  const seconds = parseDuration(m?.[1]);
  if (!m || !seconds || seconds < 600) {
    await ctx.reply(tc(ctx, "announce.usage"));
    return;
  }
  scheduleJob("announcement", { chatId: ctx.chat.id, text: m[2]!.slice(0, 3500), repeatSeconds: seconds }, seconds);
  await ctx.reply(tc(ctx, "announce.set", { duration: humanDuration(seconds) }));
});

announce.command("announcements", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const jobs = listJobsByKind("announcement").filter(
    (j) => (JSON.parse(j.payload) as { chatId: number }).chatId === ctx.chat.id,
  );
  if (!jobs.length) {
    await ctx.reply(tc(ctx, "announce.none"));
    return;
  }
  const rows = jobs
    .map((j) => {
      const p = JSON.parse(j.payload) as { text: string; repeatSeconds?: number };
      const every = p.repeatSeconds ? humanDuration(p.repeatSeconds) : "-";
      return `<code>${j.id}</code> · ${every} · ${escapeHtml(p.text.slice(0, 60))}`;
    })
    .join("\n");
  await ctx.reply(tc(ctx, "announce.list", { rows }), { parse_mode: "HTML" });
});

announce.command("unannounce", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const id = Number(ctx.match.trim());
  const ownJob =
    id &&
    listJobsByKind("announcement").some(
      (j) => j.id === id && (JSON.parse(j.payload) as { chatId: number }).chatId === ctx.chat.id,
    );
  if (!ownJob) {
    await ctx.reply(tc(ctx, "announce.usage"));
    return;
  }
  deleteJob(id);
  await ctx.reply(tc(ctx, "announce.removed"));
});
