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
| 🤖 | **AI assistant** | `/ask`, reply-to-bot, or @mention · pick **any provider & model from models.dev** via inline menus · streaming answers (throttled edits, within Telegram's rate budget) · per-chat personality (`/aiprompt`) · `/summarize` for group digests |
| 🧠 | **Layered memory** | Rolling short-term transcript **plus** a model-maintained long-term summary (OpenClaw/Hermes-style compaction) · per group *and* per forum topic · `/memory` to inspect, `/forget` to wipe |
| 🛡 | **Moderation** | `/warn` with auto-escalation · timed `/mute 2h` (server-enforced `until_date` — survives restarts) · `/ban` + full message wipe · safe `/unban` · `/purge` bulk delete · `/lockdown` & `/unlock` · `/info`, `/report` |
| 👋 | **Onboarding** | Reliable join detection via `chat_member` · welcome messages (auto-cleanup) · button captcha with timeout-kick · join-request gate verified in DM |
| 🌊 | **Anti-abuse** | Anti-flood auto-mute · channel-persona spam blocking (linked channel whitelisted) · anonymous-admin & auto-forward aware |
| 📒 | **Notes & rules** | `/save faq` → recall with `#faq` · `/setrules` & `/rules` |
| 🎲 | **Engagement** | Dice/darts/slot games · `/poll` & multi-answer `/quiz` · `/remind 10m …` · `/donate` via Telegram Stars ⭐ (with owner `/refund`) |
| 📣 | **Channels** | Tracks channels it administers, `/ping` health check |
| 💼 | **Telegram Business** | Answers incoming customer chats with AI on the owner's behalf (rate-limited & concurrency-capped) |
| 📋 | **Bot manager** | `/status` shows every chat it manages + its admin rights in each · group→supergroup migration handled automatically |
| 🌐 | **10 languages** | Auto-detected from each user's Telegram, overridable per chat via `/lang`: EN · ID · RU · ES · PT · HI · AR · FA · TR · UK |

**Everything is configured inside Telegram**: `/settings` opens an inline menu
per group (welcome, captcha, AI, ephemeral answers, anti-flood, ambient context,
warn limit, language). API keys are set by DM-ing the bot — never through a
config file, never in a group.

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
│   ├── streamer.ts       # throttled edit streaming, race-free finalization
│   ├── security.ts       # AES-256-GCM for stored keys
│   ├── telegram.ts       # ephemeral replies w/ fallback, forum-safe thread ids
│   └── jobs.ts           # durable at-least-once job runner (SQLite-backed)
└── modules/              # one file per capability
    ├── moderation.ts  onboarding.ts  antiflood.ts  settings.ts
    ├── ai.ts  notes.ts  fun.ts  stars.ts
    └── channels.ts  business.ts  manager.ts
```

Design decisions are grounded in a full platform research pass —
see [`docs/riset-telegram.md`](docs/riset-telegram.md) (Bot API 7.0 → 10.3
timeline, framework comparison, platform pitfalls).

## 🗺 Roadmap

- [ ] Guard-bot join queries with Mini App captcha (Bot API 10.1)
- [ ] Rich Messages for AI answers (`sendRichMessage`, Bot API 10.1)
- [ ] Reaction-based karma & reaction moderation (Bot API 10.0)
- [ ] Webhook mode with multi-replica support
- [ ] Scheduled announcements & auto-slowmode raid detection

## 🤝 Contributing

Issues and PRs are welcome. Keep code comments in English, user-facing strings
in `src/i18n/locales/` (all 10 languages), and run `npm run typecheck` before
pushing.

## 📄 License

MIT
