/**
 * English — the reference locale. Every other locale mirrors these keys;
 * missing keys automatically fall back to these strings.
 * Values may contain the Telegram-HTML subset (<b>, <i>, <code>) and {vars}.
 */
export const en = {
  // ---- generic ----
  "error.adminOnly": "🔒 Only admins can use this.",
  "error.ownerOnly": "🔒 Only the bot owner can use this.",
  "error.groupOnly": "This command works in groups only.",
  "error.dmOnly": "For safety, send this in a private chat with me.",
  "error.replyRequired": "↩️ Reply to the person's message, then send the command.",
  "error.targetProtected": "🛡 That user is an admin or me — no action taken.",
  "error.generic": "⚠️ Something went wrong: {reason}",

  // ---- start / help ----
  "start.body":
    "🦑 <b>SotongAssistant</b>\n\nYour all-in-one Telegram assistant: group moderation, smart onboarding, channels, Telegram Business, and AI powered by any model from <b>models.dev</b>.\n\nTap /help to see everything I can do.",
  "help.title": "🦑 <b>What I can do</b>",
  "help.ai":
    "🤖 <b>AI</b>\n/ask &lt;question&gt; — ask the AI (or reply to me / mention me)\n/summarize — summarize recent group activity\n/aimodel — pick provider &amp; model (models.dev)\n/aiprompt &lt;text&gt; — custom personality for this chat\n/memory — show what I remember\n/forget — wipe this chat's memory",
  "help.moderation":
    "🛡 <b>Moderation</b> (admins, by reply)\n/warn /unwarn — warnings with auto-escalation\n/mute [30m|2h|1d] /unmute — timed mutes\n/ban /unban /kick — bans &amp; kicks\n/purge — bulk delete up to the replied message\n/pin — pin a message\n/lockdown /unlock — freeze the whole group\n/info — details about a user",
  "help.group":
    "👥 <b>Group tools</b>\n/settings — all settings, right here in Telegram\n/welcome &lt;text&gt; — custom welcome ({name} placeholder)\n/setrules &lt;text&gt; and /rules — group rules\n/save &lt;name&gt; and #name — reusable notes\n/notes /clear — list &amp; delete notes\n/report — call the admins\n/lang — change my language",
  "help.fun":
    "🎲 <b>Fun &amp; engagement</b>\n/dice /darts /slot — animated games\n/coin — flip a coin\n/poll &lt;question&gt; | &lt;opt1&gt; | &lt;opt2&gt; — quick poll\n/quiz &lt;question&gt; | &lt;correct&gt; | &lt;wrong&gt;… — quiz\n/remind &lt;10m|2h&gt; &lt;text&gt; — reminders\n/donate [amount] — support via Telegram Stars ⭐",
  "help.footer": "Add me to a group and promote me to <b>admin</b> to unlock everything.",

  // ---- onboarding ----
  "welcome.default": "👋 Welcome, <b>{name}</b>!",
  "captcha.prompt": "👋 Hi <b>{name}</b>! Tap the button below within 5 minutes to start chatting.",
  "captcha.button": "✅ I'm human",
  "captcha.notForYou": "This button isn't for you 🙂",
  "captcha.passed": "Welcome aboard! 🎉",
  "join.dmPrompt": "You asked to join <b>{chat}</b>.\nTap the button to verify:",
  "join.dmButton": "✅ Verify & join",
  "join.approved": "✅ Approved — welcome!",
  "join.expired": "This join request is no longer valid.",

  // ---- moderation ----
  "mod.warned": "⚠️ <b>{name}</b> has been warned ({count}/{limit}).",
  "mod.warnEscalated": "🔇 <b>{name}</b> reached {count}/{limit} warnings → muted for 24h.",
  "mod.warnsCleared": "✅ Warnings for {name} cleared.",
  "mod.muted": "🔇 {name} muted for {duration}. Telegram lifts it automatically.",
  "mod.unmuted": "🔊 {name} can speak again.",
  "mod.banned": "🔨 {name} banned; all their messages were removed.",
  "mod.unbanned": "✅ Unbanned (if they were banned).",
  "mod.kicked": "👢 {name} was kicked (they may rejoin).",
  "mod.unbanUsage": "Usage: /unban <user_id>, or reply to one of their messages.",
  "mod.purgeUsage": "Reply to the first message you want gone, then send /purge.",
  "mod.pinUsage": "Reply to the message you want to pin.",
  "mod.noRights": "🙁 I need the <b>{right}</b> admin right to do that.",
  "mod.lockdownOn": "🔒 Group locked: only admins can talk. /unlock to restore.",
  "mod.lockdownOff": "🔓 Group unlocked — previous permissions restored.",
  "mod.infoTitle": "👤 <b>{name}</b>",
  "mod.infoLine": "id: <code>{id}</code> · status: {status} · warnings: {warns}",
  "report.sent": "🚨 Admins have been notified.",
  "report.body": "🚨 <b>Report</b> from {name}: check the replied message.",

  // ---- antiflood ----
  "flood.muted": "🌊 {name} was flooding and got muted for {duration}.",

  // ---- settings ----
  "settings.title": "⚙️ <b>Settings for this chat</b>",
  "settings.dmHint": "This menu is for groups. In DM everything is already on — try /aimodel.",
  "settings.welcome": "Welcome new members",
  "settings.captcha": "Button captcha on join",
  "settings.ai": "AI assistant",
  "settings.aiEphemeral": "AI answers visible only to the asker",
  "settings.antiChannelSpam": "Block channel-persona spam",
  "settings.antiflood": "Anti-flood auto-mute",
  "settings.ambient": "Read all messages (context & /summarize)",
  "settings.warnLimit": "⚠️ Warn limit: {n}",
  "settings.language": "🌐 Language: {lang}",
  "settings.aimodelBtn": "🤖 Pick AI model → /aimodel",
  "settings.welcomeSet": "✅ Welcome message saved.",
  "settings.welcomeUsage":
    'Usage: /welcome <text>. Placeholder {name} = the member\'s name. Reset with "/welcome -".',
  "language.pick": "🌐 Pick a language for this chat:",
  "language.saved": "✅ Language set to {lang}.",

  // ---- notes & rules ----
  "notes.usage": "Usage: /save <name> <text> (or reply to a message with /save <name>).",
  "notes.saved": "📝 Note <code>#{name}</code> saved.",
  "notes.deleted": "🗑 Note <code>#{name}</code> deleted.",
  "notes.notFound": "No note named <code>#{name}</code>.",
  "notes.empty": "No notes yet. Save one with /save <name> <text>.",
  "notes.list": "📒 <b>Notes:</b> {names}",
  "rules.set": "📜 Rules saved. Everyone can read them with /rules.",
  "rules.none": "No rules set yet. Admins: /setrules <text>.",

  // ---- AI ----
  "ai.askUsage": "Usage: /ask <question>",
  "ai.disabled": "The AI is switched off here. Admins can enable it in /settings.",
  "ai.forgot": "🧠 Memory for this chat has been wiped.",
  "ai.memoryTitle": "🧠 <b>What I remember here</b>\n\n{summary}",
  "ai.memoryEmpty": "🧠 Nothing in long-term memory for this chat yet.",
  "ai.modelTitle":
    "🤖 <b>AI model for this chat</b>\nProvider: <code>{provider}</code>\nModel: <code>{model}</code>\n\nPick a provider (data: models.dev):",
  "ai.providerMissing": "That provider isn't in the catalog.",
  "ai.pickModel": "Provider <b>{provider}</b> — {keyState}\nPick a model:",
  "ai.keyOk": "✅ API key available",
  "ai.keyMissing": "⚠️ no API key yet (owner: DM me /setkey {provider} …)",
  "ai.modelSaved": "✅ AI model for this chat: <code>{provider}/{model}</code>",
  "ai.promptSaved": "✅ Custom AI personality saved for this chat.",
  "ai.promptReset": "AI personality reset to default.",
  "ai.setkeyUsage": "Usage: /setkey <provider-id> <api-key>\nExample: /setkey anthropic sk-ant-…",
  "ai.keySaved": "✅ API key for <code>{provider}</code> saved (encrypted at rest). I deleted your message for safety.",
  "ai.noKey":
    "No API key for provider <code>{provider}</code>. The bot owner can set one by sending /setkey {provider} <key> in a private chat with me.",
  "ai.summarizeOff":
    "I can only summarize when “Read all messages” is enabled in /settings (and I'm an admin).",
  "ai.summarizeEmpty": "Nothing to summarize yet.",
  "ai.prevNext.prev": "« Prev",
  "ai.prevNext.next": "Next »",

  // ---- fun / stars / reminders ----
  "fun.pollUsage": "Usage: /poll Question | Option 1 | Option 2 …",
  "fun.quizUsage": "Usage: /quiz Question | Correct answer | Wrong 1 | Wrong 2 …",
  "stars.donateTitle": "Support {bot}",
  "stars.donateDesc": "Thank you for keeping this assistant alive! ⭐",
  "stars.thanks": "💖 {name} donated {amount} ⭐ — thank you!",
  "stars.usage": "Usage: /donate [amount of Stars, e.g. /donate 50]",
  "remind.usage": "Usage: /remind <10m|2h|1d> <text>",
  "remind.set": "⏰ Okay! I'll remind you in {duration}.",
  "remind.fire": "⏰ <b>Reminder</b> {mention}: {text}",
  "settings.antiraid": "Auto raid protection",
  "raid.on": "🚨 Raid detected — group locked for {duration}. Admins: /unlock to lift early.",
  "raid.off": "🔓 Raid protection lifted — permissions restored.",
  "cas.blocked": "🚫 {name} was removed automatically (listed on CAS anti-spam).",
  "karma.title": "🏆 <b>Karma leaderboard</b>\n{rows}",
  "karma.empty": "No karma yet — react 👍 to messages to give points (needs “Read all messages” enabled).",
  "announce.usage": "Usage: /announce <6h|1d> <text> — repeating announcement (min 10m).",
  "announce.set": "📣 Announcement scheduled every {duration}.",
  "announce.none": "No scheduled announcements. Create one with /announce.",
  "announce.list": "📣 <b>Scheduled announcements</b>\n{rows}\nRemove with /unannounce <id>.",
  "announce.removed": "🗑 Announcement removed.",
  "broadcast.usage": "Usage: /broadcast <text> — send to every chat I manage (owner only).",
  "broadcast.done": "📤 Broadcast delivered to {count} chats.",
  "digest.usage": "Usage: /digest <6h|24h> — toggle a recurring AI digest (min 1h).",
  "digest.on": "🗞 Digest scheduled every {duration}. Send /digest again to disable.",
  "digest.off": "🗞 Digest disabled.",

  // ---- manager ----
  "status.title": "📋 <b>Chats I know</b>",
  "status.empty": "No chats recorded yet. Add me to a group or channel first.",
  "manager.needAdmin":
    "👋 Hi! I'm SotongAssistant.\nPromote me to <b>admin</b> (delete messages, restrict, invite, pin) to unlock moderation & AI. Then open /settings.",
} as const;
