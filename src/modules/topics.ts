import { Composer, type Context } from "grammy";
import { senderIsAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";

/**
 * Forum-topic management for supergroups with topics enabled:
 *   /newtopic <name> · /closetopic · /reopentopic · /renametopic <name>
 * The close/reopen/rename commands act on the topic they are sent in.
 * All need the bot (and use by admins) with the can_manage_topics right.
 */
export const topics = new Composer<Context>();

function isForum(ctx: Context): boolean {
  return ctx.chat?.type === "supergroup" && Boolean((ctx.chat as { is_forum?: boolean }).is_forum);
}

async function topicGuard(ctx: Context): Promise<boolean> {
  if (!isForum(ctx)) {
    await ctx.reply(tc(ctx, "topic.forumOnly"));
    return false;
  }
  if (!(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return false;
  }
  return true;
}

/** The topic the command was sent in (the General topic has no thread id). */
function currentTopicId(ctx: Context): number | undefined {
  return ctx.message?.is_topic_message ? ctx.message.message_thread_id : undefined;
}

async function withTopicRights(ctx: Context, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    await ctx.reply(tc(ctx, "mod.noRights", { right: "can_manage_topics" }), { parse_mode: "HTML" });
    return false;
  }
}

topics.command("newtopic", async (ctx) => {
  if (!(await topicGuard(ctx))) return;
  const name = ctx.match.trim().slice(0, 128);
  if (!name) {
    await ctx.reply(tc(ctx, "topic.usage"));
    return;
  }
  await withTopicRights(ctx, async () => {
    const topic = await ctx.api.createForumTopic(ctx.chat!.id, name);
    await ctx.api.sendMessage(ctx.chat!.id, tc(ctx, "topic.created", { name: escapeHtml(name) }), {
      parse_mode: "HTML",
      message_thread_id: topic.message_thread_id,
    });
  });
});

topics.command("closetopic", async (ctx) => {
  if (!(await topicGuard(ctx))) return;
  const topicId = currentTopicId(ctx);
  if (!topicId) {
    await ctx.reply(tc(ctx, "topic.usage"));
    return;
  }
  if (await withTopicRights(ctx, () => ctx.api.closeForumTopic(ctx.chat!.id, topicId))) {
    await ctx.reply(tc(ctx, "topic.closed"), { message_thread_id: topicId });
  }
});

topics.command("reopentopic", async (ctx) => {
  if (!(await topicGuard(ctx))) return;
  const topicId = currentTopicId(ctx);
  if (!topicId) {
    await ctx.reply(tc(ctx, "topic.usage"));
    return;
  }
  if (await withTopicRights(ctx, () => ctx.api.reopenForumTopic(ctx.chat!.id, topicId))) {
    await ctx.reply(tc(ctx, "topic.reopened"), { message_thread_id: topicId });
  }
});

topics.command("renametopic", async (ctx) => {
  if (!(await topicGuard(ctx))) return;
  const topicId = currentTopicId(ctx);
  const name = ctx.match.trim().slice(0, 128);
  if (!topicId || !name) {
    await ctx.reply(tc(ctx, "topic.usage"));
    return;
  }
  if (await withTopicRights(ctx, () => ctx.api.editForumTopic(ctx.chat!.id, topicId, { name }))) {
    await ctx.reply(tc(ctx, "topic.renamed", { name: escapeHtml(name) }), {
      parse_mode: "HTML",
      message_thread_id: topicId,
    });
  }
});
