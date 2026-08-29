import { Composer, InlineKeyboard, type Context } from "grammy";
import { getSettings, updateSettings, type ChatSettings } from "../db/repo.js";
import { senderIsAdmin } from "../util/admin.js";
import { langOf, t, tc } from "../i18n/index.js";

/**
 * /setup — a guided first-run wizard for a freshly added group.
 *
 * Three one-tap presets cover what most groups actually want, then the wizard
 * hands over to the full /settings panel. Everything is inline: no admin has
 * to learn a command to get a sensibly configured group.
 */
export const setup = new Composer<Context>();

type PresetKey = "community" | "strict" | "quiet";

/** Each preset is a complete, explicit patch — never a partial merge. */
const PRESETS: Record<PresetKey, Partial<ChatSettings>> = {
  // Friendly public group: greetings, AI on, light anti-abuse.
  community: {
    welcome: true,
    goodbye: false,
    captcha: false,
    ai: true,
    antiflood: true,
    antiraid: true,
    antilink: true,
    antilinkMode: "invites",
    antiNsfw: false,
    warnLimit: 3,
    warnAction: "mute",
  },
  // Locked-down group: captcha, every filter on, harsher warns.
  strict: {
    welcome: true,
    captcha: true,
    ai: true,
    aiEphemeral: true,
    antiflood: true,
    antiraid: true,
    antilink: true,
    antilinkMode: "all",
    antiNsfw: true,
    antiChannelSpam: true,
    warnLimit: 2,
    warnAction: "ban",
  },
  // Announcement-style chat: no AI chatter, minimal noise.
  quiet: {
    welcome: false,
    goodbye: false,
    captcha: false,
    ai: false,
    antiflood: true,
    antiraid: true,
    antilink: true,
    antilinkMode: "all",
    warnLimit: 3,
    warnAction: "mute",
  },
};

function presetKeyboard(lang: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(lang, "setup.community"), "su:community")
    .row()
    .text(t(lang, "setup.strict"), "su:strict")
    .row()
    .text(t(lang, "setup.quiet"), "su:quiet")
    .row()
    .text(t(lang, "setup.skip"), "su:skip");
}

setup.command("setup", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply(tc(ctx, "error.groupOnly"));
    return;
  }
  if (!(await senderIsAdmin(ctx))) {
    await ctx.reply(tc(ctx, "error.adminOnly"));
    return;
  }
  const lang = langOf(ctx);
  await ctx.reply(t(lang, "setup.intro"), {
    parse_mode: "HTML",
    reply_markup: presetKeyboard(lang),
  });
});

setup.callbackQuery(/^su:(\w+)$/, async (ctx) => {
  if (!(await senderIsAdmin(ctx))) {
    await ctx.answerCallbackQuery({ text: tc(ctx, "error.adminOnly"), show_alert: true });
    return;
  }
  const choice = ctx.match[1]!;
  const lang = langOf(ctx);
  if (choice === "skip") {
    await ctx.editMessageText(t(lang, "setup.skipped"), { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
    return;
  }
  const preset = PRESETS[choice as PresetKey];
  if (!preset) {
    await ctx.answerCallbackQuery();
    return;
  }
  updateSettings(ctx.chat!.id, preset);
  const s = getSettings(ctx.chat!.id);
  await ctx.editMessageText(
    t(lang, "setup.done", {
      preset: t(lang, `setup.${choice}` as "setup.community"),
      ai: s.ai ? "on" : "off",
      captcha: s.captcha ? "on" : "off",
      links: s.antilink ? s.antilinkMode : "off",
      warns: `${s.warnLimit}/${s.warnAction}`,
    }),
    { parse_mode: "HTML" },
  );
  await ctx.answerCallbackQuery();
});

// A fresh group gets the nudge automatically once the bot becomes admin.
setup.on("my_chat_member", async (ctx, next) => {
  const upd = ctx.myChatMember;
  const becameAdmin =
    upd.new_chat_member.status === "administrator" && upd.old_chat_member.status !== "administrator";
  if (becameAdmin && (upd.chat.type === "group" || upd.chat.type === "supergroup")) {
    await ctx.api
      .sendMessage(upd.chat.id, tc(ctx, "setup.nudge"), { parse_mode: "HTML" })
      .catch(() => undefined);
  }
  await next();
});
