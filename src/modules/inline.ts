import { Composer, InlineKeyboard, type Context } from "grammy";
import { config } from "../config.js";
import { getCatalog } from "../services/catalog.js";
import { streamCompletion, AiError } from "../services/ai/index.js";
import { escapeHtml, markdownToTelegramHtml } from "../util/format.js";
import { langOf, t } from "../i18n/index.js";

/**
 * Inline mode: @botname <question> works in ANY chat, even ones the bot is
 * not a member of. The inline result posts a placeholder immediately; the
 * chosen_inline_result update (enable "inline feedback" in BotFather!) carries
 * the inline_message_id we then edit with the real AI answer.
 * The placeholder MUST carry an inline keyboard — Telegram only includes
 * inline_message_id in chosen_inline_result when the message has one.
 */
export const inline = new Composer<Context>();

const userLastInline = new Map<number, number>();
const INLINE_COOLDOWN_MS = 15_000;
const MAX_INLINE_CHARS = 3900; // inline answers cannot be chunked into extra messages

inline.on("inline_query", async (ctx) => {
  const q = ctx.inlineQuery.query.trim();
  const lang = langOf(ctx);
  const keyboard = new InlineKeyboard().url(
    `🤖 ${ctx.me.first_name}`,
    `https://t.me/${ctx.me.username}`,
  );
  await ctx.answerInlineQuery(
    [
      {
        type: "article",
        id: "ask",
        title: t(lang, "inline.askTitle"),
        description: q || t(lang, "inline.askDesc"),
        input_message_content: {
          message_text: q
            ? `🤖 <b>${escapeHtml(q.slice(0, 256))}</b>\n\n${t(lang, "inline.wait")}`
            : t(lang, "inline.askDesc"),
          parse_mode: "HTML",
        },
        // Only attach the button (→ inline_message_id) when there is a question.
        ...(q ? { reply_markup: keyboard } : {}),
      },
    ],
    { cache_time: 0, is_personal: true },
  );
});

inline.on("chosen_inline_result", async (ctx) => {
  const chosen = ctx.chosenInlineResult;
  const q = chosen.query.trim();
  const imi = chosen.inline_message_id;
  if (!q || !imi) return;
  const lang = langOf(ctx);

  // Inline mode is reachable from anywhere — keep a per-user cooldown.
  const last = userLastInline.get(chosen.from.id) ?? 0;
  if (Date.now() - last < INLINE_COOLDOWN_MS) {
    await ctx.api
      .editMessageTextInline(imi, t(lang, "inline.slowDown"))
      .catch(() => undefined);
    return;
  }
  userLastInline.set(chosen.from.id, Date.now());
  if (userLastInline.size > 5000) userLastInline.clear(); // crude but bounded

  const providerId = config.defaultProvider;
  try {
    const provider = (await getCatalog())[providerId];
    if (!provider) throw new AiError("unsupported_provider", t(lang, "ai.providerMissing"));
    const answer = await streamCompletion(
      {
        provider,
        model: config.defaultModel,
        system:
          "You are SotongAssistant answering via Telegram inline mode. " +
          "Be helpful and CONCISE (a few short paragraphs at most). " +
          "Answer in the language of the question.",
        history: [],
        userText: q,
        userName: chosen.from.first_name,
        maxTokens: 1024,
      },
      () => undefined,
    );
    const html = `🤖 <b>${escapeHtml(q.slice(0, 256))}</b>\n\n${markdownToTelegramHtml(answer)}`.slice(
      0,
      MAX_INLINE_CHARS,
    );
    await ctx.api
      .editMessageTextInline(imi, html, { parse_mode: "HTML" })
      .catch(() =>
        // Truncated HTML can break entities — fall back to plain text.
        ctx.api.editMessageTextInline(imi, answer.slice(0, MAX_INLINE_CHARS)).catch(() => undefined),
      );
  } catch (err) {
    const text =
      err instanceof AiError && err.code === "no_key"
        ? t(lang, "ai.noKey", { provider: providerId })
        : t(lang, "error.generic", { reason: (err as Error).message.slice(0, 200) });
    await ctx.api.editMessageTextInline(imi, text).catch(() => undefined);
  }
});
