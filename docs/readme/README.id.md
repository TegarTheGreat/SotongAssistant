<div align="center">

# 🦑 SotongAssistant

**Asisten Telegram serba-bisa — moderasi, onboarding pintar, channel,
Telegram Business, dan AI dengan model apa pun dari [models.dev](https://models.dev).
Semua pengaturan ada di dalam Telegram. Tanpa dashboard web.**

🌐 [English](../../README.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Português](README.pt.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md)

</div>

---

## ✨ Fitur

| | Kapabilitas | Sorotan |
|---|---|---|
| 🪄 | **AI yang BERTINDAK** | Admin cukup **menyuruh dengan bahasa biasa** — “mute dia 2 jam”, “nyalakan captcha”, “buat polling: makan siang?”, “mode malam 23:00-06:00” — dan bot mengeksekusinya: 30+ aksi ter-whitelist, semua diverifikasi ulang server-side (khusus admin, target terlindungi, maks 3/pesan) dengan bukti eksekusi · plus `/imagine` gambar AI, `/approve` pengguna terpercaya, `/aiquota` batas biaya, tombol URL di welcome |
| 🤖 | **Asisten AI** | `/ask`, reply, atau @mention · pilih **provider & model apa pun dari models.dev** lewat menu inline · jawaban streaming · kepribadian per chat (`/aiprompt`) · `/summarize` untuk ringkasan grup |
| 🧠 | **Memori berlapis** | Transcript jangka pendek **plus** ringkasan jangka panjang yang dirawat model (gaya OpenClaw/Hermes) · per grup *dan* per topic forum · `/memory`, `/forget` |
| 🛡 | **Moderasi** | `/warn` bereskalasi otomatis · `/mute 2h` (di-enforce server Telegram — tahan restart) · `/ban` + hapus semua pesan · `/unban` aman · `/purge` · `/lockdown` & `/unlock` · `/info`, `/report` |
| 👋 | **Onboarding** | Deteksi join andal via `chat_member` · welcome (auto-bersih) · captcha tombol + kick timeout · gerbang join-request via DM |
| 🌊 | **Anti-abuse** | Anti-flood auto-mute · blokir spam persona channel (channel tertaut di-whitelist) · paham admin anonim & auto-forward |
| 📒 | **Catatan & aturan** | `/save faq` → panggil dengan `#faq` · `/setrules` & `/rules` |
| 🎲 | **Engagement** | Dadu/darts/slot · `/poll` & `/quiz` multi-jawaban · `/remind 10m …` · `/donate` via Telegram Stars ⭐ |
| 📣 | **Channel** | Melacak channel yang dikelola, `/ping` |
| 💼 | **Telegram Business** | Membalas chat pelanggan dengan AI atas nama pemilik akun (dibatasi rate & konkurensi) |
| 📋 | **Bot manager** | `/status`: semua chat + hak admin bot · migrasi supergroup otomatis |
| 🧹 | **Higiene pesan** | **Filter kata kunci** (`/filter`), **blocklist kata** (`/block`) dengan hapus otomatis, hapus tautan undangan · panel moderasi satu-ketuk `/mp` (ephemeral) |
| 🤝 | **Federasi** | **Daftar ban lintas grup**: `/newfed` → `/joinfed` di tiap grup · `/fban` mem-ban di semua grup sekaligus dan mengusir otomatis saat join |
| 🌍 | **Terjemahan** | `/tr` (reply) menerjemahkan pesan · `/bridge de` menerjemahkan otomatis pesan berbahasa asing untuk grup multibahasa |
| 📊 | **Statistik & dasar** | `/stats` grafik aktivitas & anggota teraktif · `/recall` cari pesan · `/afk` · `/ping` `/uptime` `/about` `/admins` `/invite` |
| 🔎 | **Inline & lainnya** | `@botname pertanyaan` bertanya ke AI **dari chat mana pun** · AI **mengenal dirinya sendiri** (versi, perintah, pengaturan chat) · **self-update** (`/update`, `AUTO_UPDATE=true`) · `/subscription` langganan Stars untuk channel |
| 🌙 | **Mode malam & zona waktu** | `/night 23:00-06:00` mengunci grup terjadwal harian dalam waktu lokal chat (`/settz Asia/Jakarta`), dengan pengumuman tutup/buka dan pemulihan izin persis |
| 🔞 | **Filter NSFW** | Saringan AI opt-in untuk foto & thumbnail stiker/video memakai model multimodal milik chat — NSFW dihapus dan masuk eskalasi warn; fail-open dan hemat kuota |
| 👑 | **Perkakas admin** | `/promote` `/demote` `/title` · `/warnmode` (mute/kick/ban) · “@admin” memanggil admin · `/tagall` · `/disable` matikan perintah per chat · `/antilink off\|invites\|all` + `/allowlink` · topik forum (`/newtopic` dll.) · welcome & goodbye dengan placeholder `{mention}` `{count}` |
| 🧰 | **Serba lengkap & full inline** | `/lock` kunci 12 tipe media · `/schedule` pesan terjadwal waktu lokal · voice note di DM ditranskripsi (Whisper) & dijawab, `/transcribe` di grup · `/unote` dosir pengguna di `/info` · `/fexport`/`/fimport` + admin federasi · `/import` pulihkan backup · `/paidpost` media berbayar Stars · panel `/settings` sepenuhnya tombol inline (termasuk submenu kunci) |
| 🧰 | **Ronde kapabilitas penuh** | `/aitask` posting AI terjadwal (teks selalu baru) · `/kang` kloning stiker ke pack sendiri · pengumuman video chat + pengingat otomatis · `/gifts` `/gift` `/balance` ekonomi Stars · `/tag` member tag · `/unpin` `/unpinall` `/revokeinvite` `/boosts` · owner atur identitas bot dari Telegram (`/setbotname` dll.) · `/recall` kini hybrid (leksikal + embedding semantik) · aksi AI owner di DM |
| 🌐 | **10 bahasa** | Deteksi otomatis dari Telegram user, bisa dioverride per chat via `/lang` |

**Semua konfigurasi di dalam Telegram**: `/settings` membuka menu inline per grup
(welcome, captcha, AI, jawaban ephemeral, anti-flood, konteks ambient, batas warn, bahasa).
API key disetel lewat DM ke bot — tidak pernah lewat file config, tidak pernah di grup.

## 🚀 Mulai cepat

> **Prasyarat:** Node.js ≥ 20 dan token bot dari [@BotFather](https://t.me/BotFather).

```bash
git clone https://github.com/TegarTheGreat/SotongAssistant.git
cd SotongAssistant
cp .env.example .env        # isi BOT_TOKEN dan OWNER_ID
npm install
npm run dev                 # atau: npm start
```

Lalu di Telegram:

1. **DM bot** → `/setkey anthropic sk-ant-…` (khusus owner; pesan langsung dihapus, key disimpan terenkripsi).
2. **Tambahkan bot ke grup** dan jadikan **admin** (hapus pesan, restrict, undang, pin). Tanpa admin, bot tidak melihat semua pesan (privacy mode Telegram).
3. Di grup: `/settings` untuk semuanya, `/aimodel` untuk memilih model AI.
4. *(Opsional)* **Business**: hubungkan di *Settings → Telegram Business → Chatbots*.

### Konfigurasi

| Env var | Wajib | Arti |
|---|---|---|
| `BOT_TOKEN` | ✅ | Token dari @BotFather |
| `OWNER_ID` | ✅ | User id Telegram-mu (lihat `/id`) |
| `SECRET_KEY` | – | Kunci enkripsi untuk API key tersimpan |
| `DATA_DIR` | – | Direktori SQLite + cache (default `./data`) |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL` | – | Model AI default (`anthropic` / `claude-opus-5`) |
| `ANTHROPIC_API_KEY`, dst. | – | Fallback API key via env (nama mengikuti models.dev) |

## 📦 Deploy

**Docker (disarankan):**

```bash
cp .env.example .env
docker compose up -d --build
```

Database SQLite tersimpan di `./data`. Jalankan **satu replica per token** — polling ganda ditolak Telegram (409).

**systemd / PM2:** lihat [README utama](../../README.md#-deployment) untuk unit file lengkap. Ringkas: `pm2 start "npx tsx src/main.ts" --name sotong --kill-timeout 10000`.

## 🔐 Keamanan

- API key provider **terenkripsi saat disimpan** (AES-256-GCM), hanya bisa disetel owner via DM, pesan berisi key langsung dihapus.
- Semua teks user di-escape sebelum dirender; system prompt menginstruksikan model memperlakukan teks user sebagai konten, bukan perintah.
- Perintah moderasi memverifikasi status admin, menolak menarget admin/bot, dan paham admin anonim, persona channel, serta auto-forward channel tertaut.
- "Baca semua pesan" (untuk `/summarize`) adalah **opt-in eksplisit** per grup, default mati.
- Rate limit di semua jalur AI.

## 🏗 Arsitektur & riset

Struktur kode, keputusan desain, dan roadmap ada di [README utama](../../README.md#-architecture).
Riset platform lengkap (timeline Bot API 7.0→10.3, perbandingan framework, jebakan): [`docs/riset-telegram.md`](../riset-telegram.md).

## 📄 Lisensi

MIT
