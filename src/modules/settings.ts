import { Composer, InlineKeyboard, type Context } from "grammy";
import { getSettings, updateSettings, type ChatSettings } from "../db/repo.js";
import { senderIsAdmin } from "../util/admin.js";
import { langOf, t, tc, LANGUAGE_NAMES, type LocaleKey } from "../i18n/index.js";

/** All configuration happens INSIDE Telegram — an inline menu per chat. */
export const settings = new Composer<Context>();

type ToggleKey = keyof Pick<
  ChatSettings,
  "welcome" | "captcha" | "ai" | "aiEphemeral" | "antiChannelSpam" | "antiflood" | "ambient"
>;

const TOGGLES: Array<{ key: ToggleKey; label: LocaleKey }> = [
  { key: "welcome", label: "settings.welcome" },
  { key: "captcha", label: "settings.captcha" },
  { key: "ai", label: "settings.ai" },
  { key: "aiEphemeral", label: "settings.aiEphemeral" },
  { key: "antiChannelSpam", label: "settings.antiChannelSpam" },
  { key: "antiflood", label: "settings.antiflood" },
  { key: "ambient", label: "settings.ambient" },
];

function settingsKeyboard(lang: string, s: ChatSettings): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const item of TOGGLES) {
    kb.text(`${s[item.key] ? "🟢" : "⚪"} ${t(lang, item.label)}`, `set:${item.key}`).row();
  }
  kb.text(t(lang, "settings.warnLimit", { n: s.warnLimit }), "set:warnLimit").row();
  kb.text(t(lang, "settings.language", { lang: LANGUAGE_NAMES[s.language ?? ""] ?? "auto" }), "set:language").row();
  kb.text(t(lang, "settings.aimodelBtn"), "set:aimodel");
  return kb;
}

function languageKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  const codes = Object.keys(LANGUAGE_NAMES);
  codes.forEach((code, i) => {
    kb.text(LANGUAGE_NAMES[code]!, `lang:${code}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

settings.command("settings", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply(tc(ctx, "settings.dmHint"));
    return;
  }
  if (!(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const lang = langOf(ctx);
  await ctx.reply(t(lang, "settings.title"), {
    parse_mode: "HTML",
    reply_markup: settingsKeyboard(lang, getSettings(ctx.chat.id)),
  });
});

settings.command("lang", async (ctx) => {
  if (ctx.chat.type !== "private" && !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  await ctx.reply(tc(ctx, "language.pick"), { reply_markup: languageKeyboard() });
});

settings.callbackQuery(/^lang:(\w+)$/, async (ctx) => {
  if (ctx.chat?.type !== "private" && !(await senderIsAdmin(ctx))) {
    await ctx.answerCallbackQuery({ text: tc(ctx, "error.adminOnly"), show_alert: true });
    return;
  }
  const code = ctx.match[1]!;
  if (!(code in LANGUAGE_NAMES)) {
    await ctx.answerCallbackQuery();
    return;
  }
  updateSettings(ctx.chat!.id, { language: code });
  await ctx.editMessageText(t(code, "language.saved", { lang: LANGUAGE_NAMES[code]! }));
  await ctx.answerCallbackQuery();
});

settings.callbackQuery(/^set:(.+)$/, async (ctx) => {
  if (!(await senderIsAdmin(ctx))) {
    await ctx.answerCallbackQuery({ text: tc(ctx, "error.adminOnly"), show_alert: true });
    return;
  }
  const key = ctx.match[1]!;
  const chatId = ctx.chat!.id;
  const lang = langOf(ctx);
  const s = getSettings(chatId);

  if (key === "warnLimit") {
    const next = s.warnLimit >= 5 ? 2 : s.warnLimit + 1;
    const updated = updateSettings(chatId, { warnLimit: next });
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(lang, updated) });
    await ctx.answerCallbackQuery({ text: t(lang, "settings.warnLimit", { n: next }) });
    return;
  }
  if (key === "language") {
    await ctx.editMessageText(t(lang, "language.pick"), { reply_markup: languageKeyboard() });
    await ctx.answerCallbackQuery();
    return;
  }
  if (key === "aimodel") {
    await ctx.answerCallbackQuery({ text: "/aimodel" });
    return;
  }
  const toggle = TOGGLES.find((x) => x.key === key);
  if (!toggle) {
    await ctx.answerCallbackQuery();
    return;
  }
  const updated = updateSettings(chatId, { [toggle.key]: !s[toggle.key] } as Partial<ChatSettings>);
  await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(lang, updated) });
  await ctx.answerCallbackQuery();
});

// /welcome <text> — {name} is replaced with the member's name.
settings.command("welcome", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) return;
  const text = ctx.match.trim();
  if (!text) {
    await ctx.reply(tc(ctx, "settings.welcomeUsage"));
    return;
  }
  updateSettings(ctx.chat.id, { welcomeText: text === "-" ? undefined : text });
  await ctx.reply(tc(ctx, "settings.welcomeSet"));
});
