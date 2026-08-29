import { Composer, type Context } from "grammy";
import { config } from "../config.js";
import { getSettings, updateSettings } from "../db/repo.js";
import { getCatalog } from "../services/catalog.js";
import { streamCompletion } from "../services/ai/index.js";
import { senderIsAdmin } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";
import { tc, LANGUAGE_NAMES, langOf } from "../i18n/index.js";
import { threadIdOf } from "../services/telegram.js";

/**
 * Translation, powered by the chat's configured AI model:
 *  - /tr [lang] as a reply — translate the replied message
 *  - /bridge <lang|off> — auto-translation bridge: messages written in other
 *    languages get a translated companion reply (opt-in, throttled)
 */
export const translate = new Composer<Context>();

const bridgeWindow = new Map<number, number[]>(); // per-chat throttle
const BRIDGE_LIMIT_PER_MIN = 6;

async function aiTranslate(chatId: number, text: string, target: string, skipIfSame: boolean): Promise<string | undefined> {
  const settings = getSettings(chatId);
  const catalog = await getCatalog();
  const provider = catalog[settings.aiProvider ?? config.defaultProvider];
  if (!provider) return undefined;
  const langName = LANGUAGE_NAMES[target] ?? target;
  const system =
    `Translate the user's message into ${langName}. Answer with the translation only, no commentary.` +
    (skipIfSame ? ` If the message is already in ${langName}, answer with exactly: SKIP` : "");
  const out = await streamCompletion(
    {
      provider,
      model: settings.aiModel ?? config.defaultModel,
      system,
      history: [],
      userText: text.slice(0, 3000),
      maxTokens: 1024,
    },
    () => undefined,
  );
  const trimmed = out.trim();
  return trimmed && trimmed !== "SKIP" ? trimmed : undefined;
}

translate.command("tr", async (ctx) => {
  const source = ctx.message?.reply_to_message?.text ?? ctx.message?.reply_to_message?.caption;
  if (!source) {
    await ctx.reply(tc(ctx, "tr.usage"));
    return;
  }
  const target = ctx.match.trim().toLowerCase() || langOf(ctx);
  try {
    const out = await aiTranslate(ctx.chat.id, source, target, false);
    if (out) {
      await ctx.reply(`🌐 ${escapeHtml(out)}`, {
        parse_mode: "HTML",
        message_thread_id: threadIdOf(ctx),
        reply_parameters: { message_id: ctx.message!.reply_to_message!.message_id },
      });
    }
  } catch (err) {
    await ctx.reply(tc(ctx, "error.generic", { reason: (err as Error).message }));
  }
});

translate.command("bridge", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const arg = ctx.match.trim().toLowerCase();
  if (arg === "off") {
    updateSettings(ctx.chat.id, { autoTranslate: undefined });
    await ctx.reply(tc(ctx, "bridge.off"));
    return;
  }
  if (!arg || !(arg in LANGUAGE_NAMES)) {
    await ctx.reply(tc(ctx, "bridge.usage", { langs: Object.keys(LANGUAGE_NAMES).join(", ") }));
    return;
  }
  updateSettings(ctx.chat.id, { autoTranslate: arg });
  await ctx.reply(tc(ctx, "bridge.on", { lang: LANGUAGE_NAMES[arg]! }));
});

// The bridge itself: quietly appends translations for foreign-language messages.
translate.on("message:text", async (ctx, next) => {
  const chat = ctx.chat;
  if (chat.type !== "group" && chat.type !== "supergroup") return next();
  const target = getSettings(chat.id).autoTranslate;
  const text = ctx.message.text;
  if (!target || !ctx.from || ctx.from.is_bot || text.startsWith("/") || text.length < 8) return next();

  const nowMs = Date.now();
  const hits = (bridgeWindow.get(chat.id) ?? []).filter((t) => nowMs - t < 60_000);
  if (hits.length >= BRIDGE_LIMIT_PER_MIN) return next(); // budget guard
  hits.push(nowMs);
  bridgeWindow.set(chat.id, hits);

  try {
    const out = await aiTranslate(chat.id, text, target, true);
    if (out && out.toLowerCase() !== text.toLowerCase()) {
      await ctx.reply(`🌐 ${escapeHtml(out)}`, {
        parse_mode: "HTML",
        message_thread_id: threadIdOf(ctx),
        reply_parameters: { message_id: ctx.message.message_id },
      });
    }
  } catch {
    /* the bridge is best-effort — never block the pipeline */
  }
  await next();
});
