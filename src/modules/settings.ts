import { Composer, InlineKeyboard, type Context } from "grammy";
import { getSettings, updateSettings, type ChatSettings } from "../db/index.js";
import { senderIsAdmin } from "../util/admin.js";

/**
 * Semua konfigurasi dilakukan DI DALAM Telegram — menu inline per chat.
 */
export const settings = new Composer<Context>();

type ToggleKey = keyof Pick<
  ChatSettings,
  "welcome" | "captcha" | "ai" | "aiEphemeral" | "antiChannelSpam"
>;

const TOGGLES: Array<{ key: ToggleKey; label: string }> = [
  { key: "welcome", label: "Welcome member baru" },
  { key: "captcha", label: "Captcha tombol saat join" },
  { key: "ai", label: "Asisten AI" },
  { key: "antiChannelSpam", label: "Blokir spam persona channel" },
];

function settingsKeyboard(s: ChatSettings): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of TOGGLES) {
    kb.text(`${s[t.key] ? "🟢" : "⚪"} ${t.label}`, `set:${t.key}`).row();
  }
  kb.text(`⚠️ Batas warn: ${s.warnLimit}`, "set:warnLimit").row();
  kb.text("🤖 Pilih model AI → /aimodel", "set:aimodel");
  return kb;
}

settings.command("settings", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("Menu ini untuk grup/channel. Di DM, semua fitur AI aktif langsung — coba /aimodel.");
    return;
  }
  if (!(await senderIsAdmin(ctx))) {
    await ctx.reply("Hanya admin yang boleh membuka pengaturan.");
    return;
  }
  const s = getSettings(ctx.chat.id);
  await ctx.reply("⚙️ <b>Pengaturan chat ini</b>", {
    parse_mode: "HTML",
    reply_markup: settingsKeyboard(s),
  });
});

settings.callbackQuery(/^set:(.+)$/, async (ctx) => {
  if (!(await senderIsAdmin(ctx))) {
    await ctx.answerCallbackQuery({ text: "Hanya admin.", show_alert: true });
    return;
  }
  const key = ctx.match[1]!;
  const chatId = ctx.chat!.id;
  const s = getSettings(chatId);

  if (key === "warnLimit") {
    const next = s.warnLimit >= 5 ? 2 : s.warnLimit + 1;
    const updated = updateSettings(chatId, { warnLimit: next });
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(updated) });
    await ctx.answerCallbackQuery({ text: `Batas warn: ${next}` });
    return;
  }
  if (key === "aimodel") {
    await ctx.answerCallbackQuery({ text: "Kirim /aimodel di chat ini" });
    return;
  }
  const toggle = TOGGLES.find((t) => t.key === key);
  if (!toggle) {
    await ctx.answerCallbackQuery();
    return;
  }
  const updated = updateSettings(chatId, { [toggle.key]: !s[toggle.key] } as Partial<ChatSettings>);
  await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(updated) });
  await ctx.answerCallbackQuery();
});

// /welcome <teks> — {name} diganti nama member
settings.command("welcome", async (ctx) => {
  if (ctx.chat.type === "private" || !(await senderIsAdmin(ctx))) return;
  const text = ctx.match.trim();
  if (!text) {
    await ctx.reply('Pakai: /welcome <teks>. Placeholder {name} = nama member. Kosongkan dengan "/welcome -".');
    return;
  }
  updateSettings(ctx.chat.id, { welcomeText: text === "-" ? undefined : text });
  await ctx.reply("✅ Pesan welcome disimpan.");
});
