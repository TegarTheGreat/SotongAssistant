# 🦑 SotongAssistant

Asisten Telegram serba-bisa berbasis **grammY** (Bot API 10.3) + **TypeScript**:
moderasi grup, onboarding member, channel, Telegram Business, kesadaran multi-chat
("bot manager"), dan **AI dengan model apa pun dari katalog [models.dev](https://models.dev)** —
semua konfigurasi dilakukan **di dalam Telegram**, tanpa dashboard web.

> Latar riset lengkap (Bot API 10.3, perbandingan framework, jebakan platform):
> [`docs/riset-telegram.md`](docs/riset-telegram.md)

## Fitur

| Modul | Kemampuan |
|---|---|
| **Moderasi** | /warn (eskalasi otomatis → mute), /mute /unmute dengan durasi (`/mute 2h`), /ban (+hapus semua pesan), /unban (aman — `only_if_banned`), /kick, /purge batch, /pin, blokir spam persona channel |
| **Onboarding** | Deteksi join andal via `chat_member`, welcome message (auto-hapus), captcha tombol opsional, gerbang join-request dengan verifikasi via DM |
| **AI (models.dev)** | /ask, reply, atau @mention; pilih **provider & model apa pun** dari katalog models.dev lewat menu inline (/aimodel); pseudo-streaming (edit ber-throttle sesuai budget 20 pesan/menit/grup); memori percakapan per chat/topic; system prompt per chat (/aiprompt) |
| **Pengaturan di Telegram** | /settings — menu inline per grup: welcome, captcha, AI, anti-spam channel, batas warn |
| **Channel** | Pelacakan channel tempat bot jadi admin, /ping di channel |
| **Business** | Terima `business_connection`; balas chat masuk pelanggan dengan AI atas nama pemilik akun (butuh Telegram Premium di sisi pemilik) |
| **Bot manager** | /status (owner): semua chat yang dikelola + status & hak admin bot; migrasi group→supergroup ditangani otomatis |

## Menjalankan

```bash
cp .env.example .env      # isi BOT_TOKEN (dari @BotFather) dan OWNER_ID
npm install
npm run dev               # atau: npm start
```

Setelah bot hidup:

1. **DM bot** → `/setkey anthropic sk-ant-...` (owner) — atau setel `ANTHROPIC_API_KEY` dkk. di env.
2. **Tambahkan ke grup** → jadikan **admin** (hapus pesan, restrict, undang, pin). Tanpa admin,
   bot tidak melihat semua pesan (privacy mode) dan moderasi tidak berfungsi.
3. Di grup: `/settings` untuk konfigurasi, `/aimodel` untuk memilih model AI.
4. Business: pemilik akun Premium menghubungkan bot lewat
   *Settings → Telegram Business → Chatbots*, beri izin *reply to messages*.

Default AI: `anthropic/claude-opus-5` (bisa diganti per chat via /aimodel, atau global via env
`DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL`).

## Arsitektur

```
src/
  main.ts                 bootstrap: allowed_updates eksplisit, bot.catch, graceful shutdown
  config.ts               env
  db/index.ts             SQLite (better-sqlite3): settings per chat, warns atomik,
                          memori AI, API key provider, job terjadwal tahan-restart, business
  services/
    catalog.ts            katalog models.dev (fetch + cache 24 jam + fallback offline)
    ai/index.ts           router adapter (field `npm` provider menentukan protokol)
    ai/anthropic.ts       @anthropic-ai/sdk (streaming, model Claude)
    ai/openaiCompat.ts    provider OpenAI-compatible (OpenAI, Groq, OpenRouter, DeepSeek, …)
    streamer.ts           pseudo-streaming: placeholder + edit ber-throttle + HTML final
    jobs.ts               pelaksana job terjadwal (hapus pesan, kick captcha timeout)
  modules/
    moderation.ts  onboarding.ts  settings.ts  ai.ts  channels.ts  business.ts  manager.ts
```

Keputusan desain penting (berakar di [`docs/riset-telegram.md`](docs/riset-telegram.md)):

- **`allowed_updates` eksplisit** — tanpa ini `chat_member`/`message_reaction` tidak pernah dikirim Telegram.
- **Mute/ban memakai `until_date`** — Telegram yang meng-enforce di server; tahan restart tanpa scheduler.
- **Counter warn = operasi atomik SQLite**, bukan session — bebas race saat dua admin /warn bersamaan.
- **Guard identitas**: admin anonim (`sender_chat == chat`), feed channel tertaut (`is_automatic_forward`),
  dan `ctx.from` yang bisa kosong ditangani di semua jalur.
- **Migrasi group→supergroup** memindahkan seluruh data ke `chat_id` baru secara transaksional.
- **API key** disimpan di SQLite lokal (`data/`) dan hanya bisa disetel owner via DM. Amankan file DB
  (`chmod 700 data/`); untuk produksi serius pertimbangkan secret manager + env.

## Batasan yang diketahui

- Streaming draft native Telegram (`sendMessageDraft`) masih private-chat-only per Bot API 10.3 —
  di grup dipakai pseudo-streaming (edit ber-throttle).
- Polling = satu instance per token (409 kalau dobel; pakai token terpisah untuk dev).
  Untuk skala/webhook, lihat panduan deployment di dokumen riset.
- Balasan business memakai model default global (bukan per-koneksi) — perluas bila perlu.
