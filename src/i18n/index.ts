import type { Context } from "grammy";
import { getSettings } from "../db/repo.js";
import { en } from "./locales/en.js";
import { id } from "./locales/id.js";
import { ru } from "./locales/ru.js";
import { es } from "./locales/es.js";
import { pt } from "./locales/pt.js";
import { hi } from "./locales/hi.js";
import { ar } from "./locales/ar.js";
import { fa } from "./locales/fa.js";
import { tr } from "./locales/tr.js";
import { uk } from "./locales/uk.js";

/**
 * Lightweight i18n. Locales cover the largest Telegram markets:
 * English, Indonesian, Russian, Spanish, Portuguese (Brazil), Hindi,
 * Arabic, Persian, Turkish, Ukrainian.
 *
 * Language resolution order:
 *   1. per-chat override set via /settings or /lang
 *   2. the sender's Telegram client language_code
 *   3. English
 */
export type LocaleKey = keyof typeof en;

export const LOCALES: Record<string, Partial<Record<LocaleKey, string>>> = {
  en,
  id,
  ru,
  es,
  pt,
  hi,
  ar,
  fa,
  tr,
  uk,
};

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  id: "Bahasa Indonesia",
  ru: "Русский",
  es: "Español",
  pt: "Português (BR)",
  hi: "हिन्दी",
  ar: "العربية",
  fa: "فارسی",
  tr: "Türkçe",
  uk: "Українська",
};

function normalize(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const base = code.toLowerCase().split("-")[0]!;
  return base in LOCALES ? base : undefined;
}

/** Resolve the language for a given update context. */
export function langOf(ctx: Context): string {
  const chatId = ctx.chat?.id;
  if (chatId) {
    const override = getSettings(chatId).language;
    if (override && override in LOCALES) return override;
  }
  return normalize(ctx.from?.language_code) ?? "en";
}

/** Translate a key with {var} interpolation; falls back to English. */
export function t(lang: string, key: LocaleKey, vars?: Record<string, string | number>): string {
  const template = LOCALES[lang]?.[key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Convenience: translate using the context's resolved language. */
export function tc(ctx: Context, key: LocaleKey, vars?: Record<string, string | number>): string {
  return t(langOf(ctx), key, vars);
}
