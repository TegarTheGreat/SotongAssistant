import type { Context } from "grammy";
import { config } from "../config.js";
import { getSettings } from "../db/repo.js";
import { getVersionInfo } from "./updater.js";

/**
 * Self-knowledge: a capability card appended to every AI system prompt, so the
 * assistant can answer questions about itself — what it can do, how it is
 * configured in THIS chat, and how users change that — without hallucinating.
 */

const COMMAND_SUMMARY = `
Commands you (the bot) support — point people to these when relevant:
- AI: /ask, /summarize (needs "Read all messages"), /aimodel (pick any provider/model from models.dev), /aiprompt, /memory, /forget, /digest; inline mode: @botname <question> in any chat
- Moderation (admins, by reply): /warn /unwarn /warnmode (mute|kick|ban at the limit) /mute /unmute /ban /unban /kick /promote /demote /title /purge /pin /del /lockdown /unlock /info (shows karma, fed-ban, admin notes) /unote /unotes /delnotes (private notes about a user) /mp (one-tap mod panel) /report — members can also write "@admin" to call the admins
- Federations (shared ban lists): /newfed (DM) /joinfed /leavefed /fban /unfban /fedinfo /fpromote /fdemote (fed admins) /fexport /fimport (portable JSON ban lists)
- Message hygiene: /filter /unfilter /filters (auto-replies, quoted multi-word triggers, {name}/{chat} placeholders), /block /unblock /blocklist (banned words), /antilink off|invites|all with /allowlink domain allowlist, /lock /unlock /locks (per-type media locks: stickers gifs photos videos voice audio documents polls games contacts locations forwards), NSFW photo screening via the "NSFW media filter" toggle, /disable /enable /disabled (per-chat command management)
- Scheduling: /night HH:MM-HH:MM daily auto-lockdown, /settz <IANA timezone>, /schedule HH:MM <text> one-off timed messages (/schedules /unschedule), /announce, /remind
- Voice: sending you a voice note in DM gets transcribed (Whisper via an OpenAI key) and answered; /transcribe by reply works in groups
- Payments extras: /paidpost <stars> (reply to a photo/video) reposts it as paid media
- Group tools: /settings (all toggles live in Telegram), /welcome & /goodbye (placeholders: {name} {first} {last} {fullname} {username} {mention} {id} {chat} {count}), /setrules /rules, /save /notes #name, /lang, /stats, /recall <words>, /afk, /tr (translate by reply), /bridge (auto-translation), /tagall, /admins, /invite, /id, /ping, /uptime, /about
- Forum topics (admins): /newtopic /closetopic /reopentopic /renametopic; discussion groups can auto-pin the linked channel's posts (toggle in /settings)
- Fun & payments: /dice /darts /slot /coin /poll /quiz /remind /karma, /donate (Telegram Stars), /subscription (channel Stars subscription)
- Owner (DM): /setkey (encrypted provider API keys), /status, /broadcast, /export (DB backup), /update (self-update from git)
Onboarding: welcome/goodbye messages, button captcha, Mini App captcha for join requests, CAS screening, raid auto-lockdown.
`.trim();

/** Build the capability card for the current chat. Cheap: version is cached. */
export async function selfKnowledge(ctx: Context): Promise<string> {
  const v = await getVersionInfo();
  const chat = ctx.chat;
  const lines: string[] = [
    `About yourself: you are SotongAssistant v${v.version}${v.commit ? ` (commit ${v.commit})` : ""}, ` +
      `an open-source all-in-one Telegram assistant (github.com/TegarTheGreat/SotongAssistant) ` +
      `built on grammY with AI models from the models.dev catalog.`,
  ];
  if (chat && (chat.type === "group" || chat.type === "supergroup")) {
    const s = getSettings(chat.id);
    const onOff = (b: boolean) => (b ? "on" : "off");
    lines.push(
      `Current settings of this group: AI ${onOff(s.ai)}, model ${s.aiProvider ?? config.defaultProvider}/` +
        `${s.aiModel ?? config.defaultModel}, welcome ${onOff(s.welcome)}, goodbye ${onOff(s.goodbye)}, ` +
        `captcha ${onOff(s.captcha)}, anti-flood ${onOff(s.antiflood)}, anti-raid ${onOff(s.antiraid)}, ` +
        `link filter ${s.antilink ? s.antilinkMode : "off"}, NSFW filter ${onOff(s.antiNsfw)}, ` +
        `read-all-messages ${onOff(s.ambient)}, warn limit ${s.warnLimit} (action: ${s.warnAction})` +
        (s.timezone ? `, timezone ${s.timezone}` : "") +
        (s.night ? `, night mode ${s.night.start}-${s.night.end}` : "") +
        (s.autoTranslate ? `, auto-translate to ${s.autoTranslate}` : "") +
        `. Admins change all of this with /settings.`,
    );
  } else {
    lines.push(
      `This is a private chat: the person can use /aimodel to pick any AI model and, if they are the owner, ` +
        `/setkey to store provider API keys (encrypted).`,
    );
  }
  lines.push(COMMAND_SUMMARY);
  return lines.join("\n\n");
}
