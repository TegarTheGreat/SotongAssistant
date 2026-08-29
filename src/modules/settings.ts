import { Composer, InlineKeyboard, type Context } from "grammy";
import { getSettings, updateSettings, type ChatSettings } from "../db/repo.js";
import { senderIsAdmin } from "../util/admin.js";
import { isValidTimezone, localHHMM, parseHHMM } from "../util/time.js";
import { UNMUTED_PERMISSIONS } from "../util/permissions.js";
import { LOCK_TYPES } from "./locks.js";
import { escapeHtml } from "../util/format.js";
import { langOf, t, tc, LANGUAGE_NAMES, type LocaleKey } from "../i18n/index.js";

/** All configuration happens INSIDE Telegram — an inline menu per chat. */
export const settings = new Composer<Context>();

type ToggleKey = keyof Pick<
  ChatSettings,
  | "welcome"
  | "goodbye"
  | "captcha"
  | "ai"
  | "aiEphemeral"
  | "antiChannelSpam"
  | "antiflood"
  | "ambient"
  | "antiraid"
  | "antilink"
  | "antiNsfw"
  | "autoPinChannelPosts"
  | "videoChatNotify"
>;

const TOGGLES: Array<{ key: ToggleKey; label: LocaleKey }> = [
  { key: "welcome", label: "settings.welcome" },
  { key: "goodbye", label: "settings.goodbye" },
  { key: "captcha", label: "settings.captcha" },
  { key: "ai", label: "settings.ai" },
  { key: "aiEphemeral", label: "settings.aiEphemeral" },
  { key: "antiChannelSpam", label: "settings.antiChannelSpam" },
  { key: "antiflood", label: "settings.antiflood" },
  { key: "antiraid", label: "settings.antiraid" },
  { key: "antilink", label: "settings.antilink" },
  { key: "antiNsfw", label: "settings.antiNsfw" },
  { key: "autoPinChannelPosts", label: "settings.autopin" },
  { key: "videoChatNotify", label: "settings.videochat" },
  { key: "ambient", label: "settings.ambient" },
];

function settingsKeyboard(lang: string, s: ChatSettings): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const item of TOGGLES) {
    kb.text(`${s[item.key] ? "🟢" : "⚪"} ${t(lang, item.label)}`, `set:${item.key}`).row();
  }
  // Everything below is inline too: cycle buttons flip through their values,
  // submenu buttons open a dedicated keyboard — no typed commands needed.
  kb.text(t(lang, "settings.warnLimit", { n: s.warnLimit }), "set:warnLimit")
    .text(t(lang, "settings.warnmodeBtn", { action: s.warnAction }), "set:warnmode")
    .row();
  kb.text(t(lang, "settings.antilinkBtn", { mode: s.antilink ? s.antilinkMode : "off" }), "set:antilinkmode")
    .text(t(lang, "settings.locksBtn", { n: s.locks?.length ?? 0 }), "set:locks")
    .row();
  kb.text(t(lang, "settings.nightBtn", { window: s.night ? `${s.night.start}-${s.night.end}` : "off" }), "set:night")
    .text(t(lang, "settings.tzBtn", { tz: s.timezone ?? "UTC" }), "set:tz")
    .row();
  kb.text(t(lang, "settings.language", { lang: LANGUAGE_NAMES[s.language ?? ""] ?? "auto" }), "set:language").row();
  kb.text(t(lang, "settings.aimodelBtn"), "set:aimodel");
  return kb;
}

function locksKeyboard(lang: string, s: ChatSettings): InlineKeyboard {
  const kb = new InlineKeyboard();
  const active = new Set(s.locks ?? []);
  LOCK_TYPES.forEach((type, i) => {
    kb.text(`${active.has(type) ? "🔒" : "⚪"} ${type}`, `lk:${type}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row().text(t(lang, "settings.back"), "lk:back");
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
  if (key === "warnmode") {
    // Cycle through the warn-limit penalties inline.
    const order = ["mute", "kick", "ban"] as const;
    const next = order[(order.indexOf(s.warnAction) + 1) % order.length]!;
    const updated = updateSettings(chatId, { warnAction: next });
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(lang, updated) });
    await ctx.answerCallbackQuery({ text: t(lang, "warnmode.set", { action: next }) });
    return;
  }
  if (key === "antilinkmode") {
    // Cycle off → invites → all.
    const current = s.antilink ? s.antilinkMode : "off";
    const next = current === "off" ? "invites" : current === "invites" ? "all" : "off";
    const updated = updateSettings(
      chatId,
      next === "off" ? { antilink: false } : { antilink: true, antilinkMode: next },
    );
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(lang, updated) });
    await ctx.answerCallbackQuery({ text: t(lang, "antilink.set", { mode: next }) });
    return;
  }
  if (key === "locks") {
    await ctx.editMessageText(t(lang, "settings.locksTitle"), {
      parse_mode: "HTML",
      reply_markup: locksKeyboard(lang, s),
    });
    await ctx.answerCallbackQuery();
    return;
  }
  if (key === "night") {
    // Free-text input (a time window) can't be a button — show how instead.
    await ctx.answerCallbackQuery({ text: t(lang, "night.usage", { tz: s.timezone ?? "UTC" }), show_alert: true });
    return;
  }
  if (key === "tz") {
    await ctx.answerCallbackQuery({ text: t(lang, "tz.usage", { now: localHHMM(s.timezone) }), show_alert: true });
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

// Content-locks submenu: toggle a type, or go back to the main panel.
settings.callbackQuery(/^lk:([a-z]+)$/, async (ctx) => {
  if (!(await senderIsAdmin(ctx))) {
    await ctx.answerCallbackQuery({ text: tc(ctx, "error.adminOnly"), show_alert: true });
    return;
  }
  const type = ctx.match[1]!;
  const chatId = ctx.chat!.id;
  const lang = langOf(ctx);
  if (type === "back") {
    await ctx.editMessageText(t(lang, "settings.title"), {
      parse_mode: "HTML",
      reply_markup: settingsKeyboard(lang, getSettings(chatId)),
    });
    await ctx.answerCallbackQuery();
    return;
  }
  if (!LOCK_TYPES.includes(type)) {
    await ctx.answerCallbackQuery();
    return;
  }
  const current = new Set(getSettings(chatId).locks ?? []);
  if (current.has(type)) current.delete(type);
  else current.add(type);
  const updated = updateSettings(chatId, { locks: current.size ? [...current] : undefined });
  await ctx.editMessageReplyMarkup({ reply_markup: locksKeyboard(lang, updated) });
  await ctx.answerCallbackQuery();
});

// /welcome <text> — full Rose-style placeholder set (see settings.placeholders).
settings.command("welcome", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) return;
  const text = ctx.match.trim();
  if (!text) {
    await ctx.reply(
      `${tc(ctx, "settings.welcomeUsage")}\n${tc(ctx, "settings.placeholders")}\n${tc(ctx, "settings.buttons")}`,
    );
    return;
  }
  updateSettings(ctx.chat.id, { welcomeText: text === "-" ? undefined : text });
  await ctx.reply(tc(ctx, "settings.welcomeSet"));
});

// /goodbye <text|-> — farewell message; same placeholders as /welcome.
settings.command("goodbye", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) return;
  const text = ctx.match.trim();
  if (!text) {
    await ctx.reply(
      `${tc(ctx, "settings.goodbyeUsage")}\n${tc(ctx, "settings.placeholders")}\n${tc(ctx, "settings.buttons")}`,
    );
    return;
  }
  updateSettings(ctx.chat.id, { goodbye: true, goodbyeText: text === "-" ? undefined : text });
  await ctx.reply(tc(ctx, "settings.goodbyeSet"));
});

// ---------- timezone & night mode ----------

// /settz Asia/Jakarta — chat-local timezone for night mode & time displays.
settings.command("settz", async (ctx) => {
  if (ctx.chat.type !== "private" && !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const tz = ctx.match.trim();
  if (!tz || !isValidTimezone(tz)) {
    await ctx.reply(tc(ctx, "tz.usage", { now: localHHMM(getSettings(ctx.chat.id).timezone) }));
    return;
  }
  updateSettings(ctx.chat.id, { timezone: tz });
  await ctx.reply(tc(ctx, "tz.set", { tz: escapeHtml(tz), now: localHHMM(tz) }), { parse_mode: "HTML" });
});

// /night 23:00-06:00 | /night off — daily auto-lockdown window (chat-local time).
settings.command("night", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const arg = ctx.match.trim().toLowerCase();
  const s = getSettings(ctx.chat.id);
  if (arg === "off") {
    // If night mode is currently holding the lock, release it right away —
    // otherwise the group would stay frozen with nothing left to unlock it.
    if (s.nightActive) {
      await ctx.api
        .setChatPermissions(ctx.chat.id, s.nightSnapshot ?? UNMUTED_PERMISSIONS)
        .catch(() => undefined);
    }
    updateSettings(ctx.chat.id, { night: undefined, nightActive: undefined, nightSnapshot: undefined });
    await ctx.reply(tc(ctx, "night.off"));
    return;
  }
  const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(arg);
  const start = m ? parseHHMM(m[1]!) : undefined;
  const end = m ? parseHHMM(m[2]!) : undefined;
  if (!m || start === undefined || end === undefined || start === end) {
    await ctx.reply(tc(ctx, "night.usage", { tz: s.timezone ?? "UTC" }));
    return;
  }
  updateSettings(ctx.chat.id, { night: { start: m[1]!, end: m[2]! } });
  await ctx.reply(
    tc(ctx, "night.set", { start: m[1]!, end: m[2]!, tz: s.timezone ?? "UTC (set one with /settz)" }),
  );
});
