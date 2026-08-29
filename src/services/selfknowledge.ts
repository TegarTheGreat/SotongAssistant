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
- Moderation (admins, by reply): /warn /unwarn /mute /unmute /ban /unban /kick /purge /pin /lockdown /unlock /info /mp (one-tap mod panel) /report
- Federations (shared ban lists): /newfed (DM) /joinfed /leavefed /fban /unfban /fedinfo
- Message hygiene: /filter /unfilter /filters (auto-replies), /block /unblock /blocklist (banned words), invite-link deletion via the "Delete invite links" toggle in /settings
- Group tools: /settings (all toggles live in Telegram), /welcome, /setrules /rules, /save /notes #name, /lang, /stats, /recall <words>, /afk, /tr (translate by reply), /bridge (auto-translation), /admins, /invite, /id, /ping, /uptime, /about
- Fun & payments: /dice /darts /slot /coin /poll /quiz /remind /karma, /donate (Telegram Stars), /subscription (channel Stars subscription)
- Owner (DM): /setkey (encrypted provider API keys), /status, /broadcast, /export (DB backup), /update (self-update from git)
Onboarding: welcome messages, button captcha, Mini App captcha for join requests, CAS screening, raid auto-lockdown.
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
        `${s.aiModel ?? config.defaultModel}, welcome ${onOff(s.welcome)}, captcha ${onOff(s.captcha)}, ` +
        `anti-flood ${onOff(s.antiflood)}, anti-raid ${onOff(s.antiraid)}, invite-link filter ${onOff(s.antilink)}, ` +
        `read-all-messages ${onOff(s.ambient)}, warn limit ${s.warnLimit}` +
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
