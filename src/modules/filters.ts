import { Composer, type Context } from "grammy";
import {
  saveFilter,
  deleteFilter,
  listFilters,
  addBlockedWord,
  removeBlockedWord,
  listBlockedWords,
  getSettings,
  updateSettings,
  isApproved,
} from "../db/repo.js";
import { senderIsAdmin, isAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Message hygiene & auto-replies:
 *  - filters: keyword → canned reply (classic community-bot staple)
 *  - blocklist: banned words are deleted on sight (non-admins)
 *  - antilink: t.me invite links from non-admins are deleted (toggle)
 */
export const filters = new Composer<Context>();

const INVITE_LINK_RE = /(?:t\.me\/(?:joinchat\/|\+)|t\.me\/[a-zA-Z]\w{3,})/i;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

/** Hostname of a matched URL, lowercased, without a leading "www.". */
function hostOf(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]!
    .toLowerCase();
}

/** "example.com" allows "example.com" and any subdomain of it. */
function isAllowedHost(host: string, allowlist: string[]): boolean {
  return allowlist.some((d) => host === d || host.endsWith(`.${d}`));
}

// ---------- admin commands ----------

// /filter <trigger> <reply>. Multi-word triggers go in quotes:
//   /filter "office hours" We're open 9-17 · placeholders: {name} {chat}
filters.command("filter", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const input = ctx.match.trim();
  let trigger: string | undefined;
  let response: string | undefined;
  const quoted = /^"([^"]+)"\s*([\s\S]*)$/.exec(input);
  if (quoted) {
    trigger = quoted[1]!.trim();
    response = quoted[2]!.trim() || undefined;
  } else {
    const [head, ...rest] = input.split(/\s+/);
    trigger = head;
    response = rest.join(" ") || undefined;
  }
  response ??= ctx.message?.reply_to_message?.text ?? ctx.message?.reply_to_message?.caption;
  if (!trigger || !response) {
    await ctx.reply(tc(ctx, "filter.usage"));
    return;
  }
  saveFilter(ctx.chat.id, trigger.toLowerCase(), response);
  await ctx.reply(tc(ctx, "filter.saved", { trigger: escapeHtml(trigger.toLowerCase()) }), {
    parse_mode: "HTML",
  });
});

filters.command("unfilter", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const trigger = ctx.match.trim().replace(/^"|"$/g, "").toLowerCase();
  const ok = trigger && deleteFilter(ctx.chat.id, trigger);
  await ctx.reply(tc(ctx, ok ? "filter.deleted" : "filter.usage", { trigger: escapeHtml(trigger) }), {
    parse_mode: "HTML",
  });
});

filters.command("filters", async (ctx) => {
  if (!isGroup(ctx)) return;
  const all = listFilters(ctx.chat.id);
  if (!all.length) {
    await ctx.reply(tc(ctx, "filter.empty"));
    return;
  }
  await ctx.reply(
    tc(ctx, "filter.list", { triggers: all.map((f) => `<code>${escapeHtml(f.trigger)}</code>`).join(" ") }),
    { parse_mode: "HTML" },
  );
});

filters.command("block", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const word = ctx.match.trim().toLowerCase();
  if (!word) {
    await ctx.reply(tc(ctx, "block.usage"));
    return;
  }
  addBlockedWord(ctx.chat.id, word);
  await ctx.reply(tc(ctx, "block.added", { word: escapeHtml(word) }), { parse_mode: "HTML" });
});

filters.command("unblock", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const word = ctx.match.trim().toLowerCase();
  const ok = word && removeBlockedWord(ctx.chat.id, word);
  await ctx.reply(tc(ctx, ok ? "block.removed" : "block.usage", { word: escapeHtml(word) }), {
    parse_mode: "HTML",
  });
});

filters.command("blocklist", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) return;
  const words = listBlockedWords(ctx.chat.id);
  if (!words.length) {
    await ctx.reply(tc(ctx, "block.empty"));
    return;
  }
  await ctx.reply(tc(ctx, "block.list", { words: words.map((w) => `<code>${escapeHtml(w)}</code>`).join(" ") }), {
    parse_mode: "HTML",
  });
});

// ---------- link policy ----------

// /antilink off|invites|all — how aggressively links are removed.
filters.command("antilink", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const arg = ctx.match.trim().toLowerCase();
  const s = getSettings(ctx.chat.id);
  if (arg === "off") {
    updateSettings(ctx.chat.id, { antilink: false });
  } else if (arg === "invites" || arg === "all") {
    updateSettings(ctx.chat.id, { antilink: true, antilinkMode: arg });
  } else {
    await ctx.reply(
      tc(ctx, "antilink.usage", { current: s.antilink ? s.antilinkMode : "off" }),
    );
    return;
  }
  await ctx.reply(tc(ctx, "antilink.set", { mode: arg }));
});

// /allowlink <domain> toggles a domain on the link allowlist; bare /allowlink lists it.
filters.command("allowlink", async (ctx) => {
  if (!isGroup(ctx) || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const s = getSettings(ctx.chat.id);
  const domain = ctx.match.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!;
  if (!domain) {
    const list = s.linkAllowlist ?? [];
    await ctx.reply(
      list.length
        ? tc(ctx, "allowlink.list", { domains: list.map((d) => `<code>${escapeHtml(d)}</code>`).join(" ") })
        : tc(ctx, "allowlink.empty"),
      { parse_mode: "HTML" },
    );
    return;
  }
  const list = s.linkAllowlist ?? [];
  const removed = list.includes(domain);
  updateSettings(ctx.chat.id, {
    linkAllowlist: removed ? list.filter((d) => d !== domain) : [...list, domain].slice(0, 50),
  });
  await ctx.reply(tc(ctx, removed ? "allowlink.removed" : "allowlink.added", { domain: escapeHtml(domain) }), {
    parse_mode: "HTML",
  });
});

// ---------- enforcement + auto-replies (must pass through to later modules) ----------

filters.on("message:text", async (ctx, next) => {
  if (!isGroup(ctx) || !ctx.from || ctx.from.is_bot || ctx.message.sender_chat) return next();
  const text = ctx.message.text;
  const lower = text.toLowerCase();
  const chatId = ctx.chat.id;
  const settings = getSettings(chatId);

  if (!lower.startsWith("/")) {
    const blocked = listBlockedWords(chatId);
    // Link policy: invite links always count; in "all" mode every URL counts
    // unless its host is on the allowlist.
    let linkHit = false;
    if (settings.antilink) {
      linkHit = INVITE_LINK_RE.test(text);
      if (!linkHit && settings.antilinkMode === "all") {
        const allow = settings.linkAllowlist ?? [];
        for (const url of text.match(URL_RE) ?? []) {
          if (!isAllowedHost(hostOf(url), allow)) {
            linkHit = true;
            break;
          }
        }
      }
    }
    const hit = linkHit || (blocked.length > 0 && blocked.some((w) => lower.includes(w)));
    // Approved users and admins are exempt; the admin lookup stays last (cached).
    if (hit && !isApproved(chatId, ctx.from.id) && !(await isAdmin(ctx, ctx.from.id))) {
      await ctx.deleteMessage().catch(() => undefined);
      return;
    }
  }

  // Keyword filters: whole-word match against the saved triggers.
  if (!lower.startsWith("/")) {
    for (const f of listFilters(chatId)) {
      const re = new RegExp(`(^|\\W)${f.trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\W)`, "i");
      if (re.test(lower)) {
        // Simple placeholders in the canned reply (escaped, so injection-safe).
        const reply = escapeHtml(f.response)
          .replaceAll("{name}", escapeHtml(ctx.from.first_name))
          .replaceAll("{chat}", escapeHtml("title" in ctx.chat ? (ctx.chat.title ?? "") : ""));
        await ctx.reply(reply, {
          parse_mode: "HTML",
          message_thread_id: threadIdOf(ctx),
          reply_parameters: { message_id: ctx.message.message_id },
        });
        break; // one filter reply per message keeps chats tidy
      }
    }
  }
  await next();
});
