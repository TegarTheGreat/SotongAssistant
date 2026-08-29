<div align="center">

# 🦑 SotongAssistant

**The all-in-one Telegram assistant — moderation, smart onboarding, channels,
Telegram Business, and AI powered by any model from [models.dev](https://models.dev).
Every setting lives inside Telegram. No web dashboard.**

![Bot API](https://img.shields.io/badge/Bot%20API-10.3-2AABEE?logo=telegram&logoColor=white)
![grammY](https://img.shields.io/badge/grammY-1.46-009dcb)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![i18n](https://img.shields.io/badge/languages-10-8A2BE2)

🌐 **Read this in:**
[Bahasa Indonesia](docs/readme/README.id.md) ·
[Русский](docs/readme/README.ru.md) ·
[Español](docs/readme/README.es.md) ·
[Português](docs/readme/README.pt.md) ·
[हिन्दी](docs/readme/README.hi.md) ·
[العربية](docs/readme/README.ar.md) ·
[فارسی](docs/readme/README.fa.md) ·
[Türkçe](docs/readme/README.tr.md) ·
[Українська](docs/readme/README.uk.md)

</div>

---

## ✨ Features

| | Capability | Highlights |
|---|---|---|
| 🪄 | **AI that ACTS** | Admins just **tell the assistant what to do in natural language** — “mute him for 2h”, “turn captcha on”, “make a poll: lunch?”, “set night mode 23:00-06:00” — and it executes: 30+ whitelisted actions (moderation, settings, filters, locks, night mode, schedules, polls…), every one re-verified server-side (admin-only, protected targets, max 3 per message), with a receipt of what ran |
| 🤖 | **AI assistant** | `/ask`, reply-to-bot, or @mention (mentioning while replying brings the replied message as context) · **`/imagine`** image generation · pick **any provider & model from models.dev** via inline menus · **native draft streaming in DMs** (Bot API 9.3, with Telegram's own “stop generating” button) and throttled-edit streaming in groups · per-chat personality (`/aiprompt`) · `/aiquota` daily cost cap · `/summarize` on demand and `/digest` on a schedule |
| 🧠 | **Layered memory** | Rolling short-term transcript **plus** a model-maintained long-term summary (OpenClaw/Hermes-style compaction) · per group *and* per forum topic · `/memory` to inspect, `/forget` to wipe |
| 🛡 | **Moderation** | `/warn` with auto-escalation and a configurable **`/warnmode` (mute/kick/ban)** · timed `/mute 2h` (server-enforced `until_date` — survives restarts) · `/ban` + full message wipe · safe `/unban` · `/purge` bulk delete · `/lockdown` & `/unlock` · `/info`, `/report` — and writing **“@admin”** calls the admins too · **`/promote` `/demote` `/title`** admin management · `/tagall` mentions active members · **`/mp` one-tap mod panel** (ephemeral inline buttons only the acting admin sees) |
| 🧹 | **Message hygiene** | **Keyword filters** (`/filter faq Read the pinned!`, quoted multi-word triggers, `{name}`/`{chat}` placeholders) · **word blocklist** (`/block`) with on-sight deletion · **`/antilink off\|invites\|all`** with a `/allowlink` domain allowlist · **`/disable` per-chat command management** · all admin-exempt |
| 🔞 | **NSFW filter** | Opt-in AI screening of photos, sticker & video thumbnails using the chat's own multimodal model — confirmed NSFW is deleted and feeds the normal warn escalation; fail-open, cached per file, budget-capped |
| 🌙 | **Night mode** | `/night 23:00-06:00` locks the group on a daily schedule in **chat-local time** (`/settz Asia/Jakarta`), announces lights-out and reopening, restores the exact permission snapshot — restart-safe |
| 🧵 | **Forum topics** | `/newtopic` `/closetopic` `/reopentopic` `/renametopic` for supergroups with Topics · discussion groups can **auto-pin the linked channel's posts** |
| 🔐 | **Content locks** | Rose-style `/lock stickers gifs forwards …` — 12 lockable media types, deleted on sight for non-admins, all toggleable from the inline `/settings` panel |
| 🗓 | **Scheduled messages** | `/schedule 18:00 <text>` (or `45m`) posts once at the given **chat-local** time — durable through restarts; `/schedules` & `/unschedule` manage them |
| 🎙 | **Voice** | Send a voice note in DM and the bot **transcribes it (Whisper) and answers**; `/transcribe` by reply converts any voice/audio/video note to text in groups |
| 📝 | **User dossiers** | `/unote` attaches private moderation notes to a user; `/info` now shows warns, karma, AFK state, federation bans and those notes in one card |
| 💾 | **Backup & restore** | Owner `/export` sends the database; **`/import`** (reply to a backup) validates it, swaps it in at boot and restarts — no shell access needed |
| ⭐ | **Paid media** | `/paidpost 50` (reply to a photo/video) reposts it as **Telegram Stars paid media** — viewers unlock by paying |
| 🌍 | **Translation** | `/tr` (reply) translates any message with the chat's AI model · **`/bridge de`** auto-translates foreign-language messages for multilingual groups (throttled, best-effort) |
| 🤝 | **Federations** | **Cross-group ban lists** (Rose-style): `/newfed` → `/joinfed` in every group · `/fban` bans everywhere at once and auto-removes listed users the moment they join |
| 📊 | **Analytics** | `/stats` — 24h/7d counters, per-day activity chart, most active members · `/recall <words>` searches recent messages (both need the ambient opt-in) |
| 💤 | **Everyday basics** | `/afk` with reasons & auto-return · `/ping`, `/uptime`, `/about` · `/admins`, `/invite`, `/echo`, `/del` |
| 🔎 | **Inline mode** | `@botname question` asks the AI **from any chat** — placeholder posts instantly, the answer streams into it (enable *inline mode* + *inline feedback* in @BotFather) |
| 🪞 | **Self-knowledge** | The AI carries a live capability card: its version, its commands, and the current settings of the very chat it's in — ask it “what can you do here?” and it answers accurately |
| ⬆️ | **Self-updating** | Hourly `git fetch` — owner `/update` applies with one tap, or set `AUTO_UPDATE=true` to pull, reinstall and restart automatically |
| 👋 | **Onboarding** | Reliable join detection via `chat_member` · welcome **and goodbye** messages (auto-cleanup) with the full Rose-style placeholder set (`{mention}` `{fullname}` `{username}` `{count}`…) **plus inline URL buttons** (`[Rules](https://…)`) · button captcha with timeout-kick · join-request gate verified in DM |
| 🤝 | **Approvals** | `/approve` marks trusted users who bypass anti-flood, content locks, link/word filters and NSFW screening — Rose-style trust lists |
| 🌊 | **Anti-abuse** | Anti-flood auto-mute · **auto raid protection** (join-spike lockdown with timed restore) · **CAS anti-spam screening** on joins & join requests · **guard-bot join queries with a self-hosted Mini App captcha** (Bot API 10.1, HMAC-verified `initData`) · channel-persona spam blocking (linked channel whitelisted) · anonymous-admin & auto-forward aware |
| 📒 | **Notes & rules** | `/save faq` → recall with `#faq` · `/setrules` & `/rules` |
| 🎲 | **Engagement** | Dice/darts/slot games · `/poll` & multi-answer `/quiz` · `/remind 10m …` · **reaction karma** with `/karma` leaderboard · recurring `/announce` posts · `/donate` via Telegram Stars ⭐ (with owner `/refund`) · **`/subscription` monthly Stars subscription links for channels** |
| 📣 | **Channels** | Tracks channels it administers, `/ping` health check |
| 💼 | **Telegram Business** | Answers incoming customer chats with AI on the owner's behalf (rate-limited & concurrency-capped) |
| 📋 | **Bot manager** | `/status` shows every chat it manages + its admin rights in each · owner `/broadcast` to all managed chats · owner `/export` database backups · group→supergroup migration handled automatically |
| 🤖 | **Rich Messages** | Final AI answers upgrade to native Rich Messages (tables, code, lists — Bot API 10.1) with automatic HTML fallback |
| 🌐 | **Webhook mode** | Set `WEBHOOK_URL` for instant delivery and multi-replica deployments; long polling stays the zero-config default |
| 🌐 | **10 languages** | Auto-detected from each user's Telegram, overridable per chat via `/lang`: EN · ID · RU · ES · PT · HI · AR · FA · TR · UK |

**Everything is configured inside Telegram, fully inline**: `/settings` opens a
button panel per group — every toggle (welcome, goodbye, captcha, AI, NSFW
filter, anti-flood, auto-pin, ambient context…), cycle buttons for the warn
limit & penalty and the link-filter mode, a **content-locks submenu**, night
mode & timezone at a glance, language and AI-model pickers. Only free-text
values (welcome text, filters, time windows) use commands, and every one
replies with its exact usage. API keys are set by DM-ing the bot — never
through a config file, never in a group.

## 🚀 Quick start

> **Prerequisites:** Node.js ≥ 20 and a bot token from [@BotFather](https://t.me/BotFather).

```bash
git clone https://github.com/TegarTheGreat/SotongAssistant.git
cd SotongAssistant
cp .env.example .env        # fill in BOT_TOKEN and OWNER_ID
npm install
npm run dev                 # or: npm start
```

Then, in Telegram:

1. **DM the bot** → `/setkey anthropic sk-ant-…` (owner only; the message is
   deleted immediately and the key is stored encrypted).
2. **Add the bot to a group** and promote it to **admin** (delete messages,
   restrict members, invite users, pin messages). Without admin it cannot see
   all messages (Telegram privacy mode) and moderation cannot work.
3. In the group: `/settings` for everything, `/aimodel` to pick the AI model.
4. *(Optional)* **Business**: connect the bot under
   *Settings → Telegram Business → Chatbots* with “reply to messages”.

### Configuration

| Env var | Required | Meaning |
|---|---|---|
| `BOT_TOKEN` | ✅ | Token from @BotFather |
| `OWNER_ID` | ✅ | Your Telegram user id (see `/id`) — may set API keys & use `/status`, `/refund` |
| `SECRET_KEY` | – | Encryption key for stored provider keys (defaults to a key derived from `BOT_TOKEN`) |
| `DATA_DIR` | – | SQLite + cache directory (default `./data`) |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL` | – | Fallback AI model (default `anthropic` / `claude-opus-5`) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, … | – | Env fallback for provider keys (names follow models.dev) |
| `WEBHOOK_URL` | – | Public HTTPS URL → switches to webhook mode (multi-replica safe) |
| `PORT` | – | HTTP port for webhook mode (default `8080`, non-POST requests answer a health check) |
| `WEBHOOK_SECRET` | – | Webhook secret token (defaults to a value derived from `BOT_TOKEN`) |
| `WEBAPP_URL` | – | Public HTTPS base of this bot's HTTP server → enables the Mini App captcha for guard-bot join requests (server also starts in polling mode) |
| `AUTO_UPDATE` | – | `true` → the hourly git check pulls, reinstalls and restarts automatically; otherwise the owner just gets a “/update available” DM |

> **Inline mode:** to use `@botname question` in any chat, enable *inline mode*
> **and** *inline feedback* for your bot in [@BotFather](https://t.me/BotFather)
> (`/setinline`, `/setinlinefeedback` → Enabled) — without inline feedback
> Telegram never tells the bot which result was sent, so answers can't arrive.

## 📦 Deployment

### Docker (recommended)

```bash
cp .env.example .env   # fill it in
docker compose up -d --build
```

The SQLite database persists in `./data`. Run **one replica per bot token** —
Telegram rejects concurrent polling with `409 Conflict`.

### systemd

```ini
# /etc/systemd/system/sotong.service
[Unit]
Description=SotongAssistant Telegram bot
After=network-online.target

[Service]
WorkingDirectory=/opt/SotongAssistant
EnvironmentFile=/opt/SotongAssistant/.env
ExecStart=/usr/bin/npx tsx src/main.ts
Restart=always
RestartSec=5
User=sotong

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now sotong
```

### PM2

```bash
pm2 start "npx tsx src/main.ts" --name sotong --kill-timeout 10000
```

> **Scaling up?** Long polling is perfect for a single process. For multiple
> replicas or instant webhooks, see the deployment notes in
> [`docs/riset-telegram.md`](docs/riset-telegram.md) (webhook topology,
> `secret_token`, reverse-proxy setup).

## 🔐 Security

- Provider API keys are **encrypted at rest** (AES-256-GCM; key derived from
  `SECRET_KEY` or the bot token) and can only be set by the owner, only in DM —
  the message containing the key is deleted right away.
- Every user-provided string is HTML-escaped before rendering; the AI system
  prompt instructs the model to treat user text as content, never instructions.
- Moderation commands verify the sender's admin status server-side (cached
  5 min), refuse to target admins or the bot, and understand anonymous admins,
  channel personas, and linked-channel auto-forwards.
- Reading all group messages (“ambient context”, used by `/summarize`) is an
  **explicit opt-in** per group, off by default.
- Rate limits everywhere AI is reachable: per-user cooldowns, one generation
  per chat, per-peer caps on Business replies.

## 🏗 Architecture

```
src/
├── main.ts               # bootstrap: explicit allowed_updates, error boundary, graceful shutdown
├── config.ts             # environment
├── i18n/                 # 10 locales, {var} interpolation, per-chat override
├── db/
│   ├── index.ts          # SQLite connection, schema, idempotent migrations
│   └── repo.ts           # typed repositories (atomic counters, jobs, notes, memory…)
├── services/
│   ├── catalog.ts        # models.dev catalog (24h cache, short retry on failure, offline fallback)
│   ├── ai/               # provider adapters: Anthropic SDK + OpenAI-compatible (SSE)
│   ├── memory.ts         # layered memory: transcript + model-maintained summary
│   ├── selfknowledge.ts  # live capability card injected into every AI prompt
│   ├── streamer.ts       # throttled edit streaming, race-free finalization
│   ├── security.ts       # AES-256-GCM for stored keys
│   ├── telegram.ts       # ephemeral replies w/ fallback, forum-safe thread ids
│   ├── updater.ts        # hourly git update check, /update & AUTO_UPDATE
│   ├── nsfw.ts           # AI image classification (fail-open, cached)
│   └── jobs.ts           # durable at-least-once job runner + night-mode reconciler
└── modules/              # one file per capability
    ├── moderation.ts  modpanel.ts  onboarding.ts  antiflood.ts  settings.ts
    ├── filters.ts  commands.ts  nsfw.ts  federation.ts  stats.ts  topics.ts
    ├── afk.ts  utility.ts  translate.ts  ai.ts  inline.ts  notes.ts  fun.ts
    └── stars.ts  channels.ts  business.ts  manager.ts
```

Design decisions are grounded in a full platform research pass —
see [`docs/riset-telegram.md`](docs/riset-telegram.md) (Bot API 7.0 → 10.3
timeline, framework comparison, platform pitfalls).

## 🗺 Roadmap

**Done**

- [x] Guard-bot join queries with a **self-hosted Mini App captcha** (Bot API 10.1)
- [x] Native draft streaming in DMs with the “stop generating” button (`sendMessageDraft`)
- [x] Rich Messages for AI answers (Bot API 10.1) · Reaction karma (10.0)
- [x] Webhook mode (multi-replica) · CI · Recurring announcements & `/digest` · Auto raid protection · CAS screening · `/broadcast` & `/export`
- [x] Inline mode: `@bot question` asks the AI from any chat (edit-in-place answers)
- [x] Telegram Stars subscriptions for channels (`/subscription`, `createChatSubscriptionInviteLink`)
- [x] Cross-group federation ban lists (`/newfed` `/joinfed` `/fban` + join-time enforcement)
- [x] Auto-translation bridge (`/bridge`) and reply translation (`/tr`)
- [x] Per-chat analytics: `/stats` activity charts + `/recall` lexical search
- [x] Ephemeral `/mp` moderation panel (actions visible only to the acting admin)
- [x] Keyword filters, word blocklist, invite-link deletion · `/afk` · utilities (`/ping` `/uptime` `/about` `/admins` `/invite`)
- [x] AI self-knowledge (live capability card in every prompt) · self-update (`/update`, `AUTO_UPDATE=true`)
- [x] Night mode (`/night`) with per-chat timezones (`/settz`) · goodbye messages & full welcome placeholders
- [x] NSFW media screening via the chat's own multimodal model (opt-in, fail-open)
- [x] `/warnmode` (mute/kick/ban) · `/promote` `/demote` `/title` · “@admin” trigger · `/tagall`
- [x] `/antilink off|invites|all` + `/allowlink` allowlist · quoted multi-word filters with placeholders
- [x] Per-chat command management (`/disable` `/enable` `/disabled`)
- [x] Forum-topic management (`/newtopic` `/closetopic` `/reopentopic` `/renametopic`) · auto-pin of linked-channel posts

- [x] AI-powered `/recall`: lexical matches plus a model-synthesized answer over the log & memory
- [x] Scheduled one-off messages (`/schedule 18:00 <text>`) in chat-local time
- [x] Locks by media type (`/lock stickers gifs forwards …`, 12 types, inline submenu)
- [x] Fed admin roles (`/fpromote`) & portable fed ban lists (`/fexport` `/fimport`)
- [x] Dashboard-free backup/restore: `/import` swaps in an `/export` file at boot
- [x] Voice: DM voice notes transcribed (Whisper) & answered · `/transcribe` in groups
- [x] Per-user moderation notes (`/unote`) & a full dossier in `/info`
- [x] Paid media posts (`/paidpost`, Telegram Stars) · fully inline `/settings` panel
- [x] **AI Actions**: natural-language group management for admins, provider-agnostic, server-verified
- [x] `/imagine` image generation · `/approve` trust lists · welcome/goodbye URL buttons
- [x] `/aiquota` per-chat daily AI caps · reply-context for @mention questions

**Next**

- [ ] True vector embeddings for `/recall` when the provider exposes an embeddings endpoint
- [ ] AI Actions in DMs for the owner (broadcasts, status, key management by chat)
- [ ] Sticker-pack tools: /kang to clone stickers into the bot's pack
- [ ] Business: AI auto-labels & folders for customer chats
- [ ] Scheduled AI prompts (“every Monday 9:00 post a standup question”)

## 🤝 Contributing

Issues and PRs are welcome. Keep code comments in English, user-facing strings
in `src/i18n/locales/` (all 10 languages), and run `npm run typecheck` before
pushing.

## 📄 License

MIT
