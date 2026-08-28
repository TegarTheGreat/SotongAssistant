# Riset: Telegram Bot API & Telegraf untuk Asisten Grup

> Riset untuk **SotongAssistant** — asisten grup Telegram berbasis Telegraf (Node.js).
> Tanggal riset: **28 Agustus 2026**. Semua fakta versi diverifikasi dari sumber live
> (mirror spec resmi, registry npm, source code Telegraf) — bukan dari ingatan model.

---

## 1. TL;DR

- **Bot API sekarang di versi 10.3** (rilis 24 Agustus 2026). Sejak akhir 2025 Telegram merilis versi baru hampir **setiap bulan**, dan gelombang 2026 (9.3 → 10.3) berisi fitur yang sangat relevan untuk asisten grup: *ephemeral messages*, *Rich Messages*, *guard bot* untuk join request, *member tags*, moderasi reaction, dan hak admin *welcome messages*.
- **Telegraf efektif "beku" di 4.16.3** (terbit 29 Feb 2024, typing hanya sampai Bot API 7.1; commit terakhir repo Jan 2025; v5 yang dijanjikan tidak pernah rilis). Semua fitur setelah Feb 2024 tetap **bisa dipakai** lewat `ctx.telegram.callApi('namaMethod', payload)` karena Bot API hanyalah HTTPS + JSON, tapi tanpa typing.
- Fondasi asisten grup (command, moderasi, keyboard, session, scenes, topics, reactions, join request) **semuanya masih ter-cover penuh** oleh Telegraf 4.16.3.
- Alternatif yang aktif dirawat: **grammY 1.46.0** (rilis 26 Agu 2026, sudah support Bot API 10.3, API mirip Telegraf). Kalau roadmap butuh banyak fitur 2024–2026, grammY risikonya lebih rendah; kalau tetap Telegraf, siapkan wrapper `callApi` + `@telegraf/types@9.2.1`.
- Tiga aturan platform yang paling sering bikin bot grup "diam-diam rusak": (1) `chat_member`, `message_reaction`, dan `chat_join_request` **tidak dikirim** kecuali dicantumkan eksplisit di `allowed_updates`; (2) *privacy mode* default membuat bot hanya melihat command/reply — jadikan bot **admin** agar melihat semua pesan; (3) `until_date` < 30 detik atau > 366 hari = **permanen**.

---

## 2. Kondisi ekosistem per Agustus 2026

### Timeline versi Bot API (7.0 → 10.3)

| Versi | Tanggal | Fitur utama (relevan untuk grup) |
|---|---|---|
| 7.0 | 29 Des 2023 | Reactions (`setMessageReaction`), boosts, Replies 2.0 (`reply_parameters` + quote), `LinkPreviewOptions`, `deleteMessages` massal, giveaways |
| 7.1–7.3 | Feb–Mei 2024 | `boost_added`, `unrestrict_boost_count`, business accounts, `ChatFullInfo` |
| 7.4–7.11 | Mei–Okt 2024 | **Telegram Stars** (invoice XTR, `refundStarPayment`), paid media, **Stars subscription invite link**, paid reactions, `CopyTextButton`, `allow_paid_broadcast` |
| 8.0–8.3 | Nov 2024–Feb 2025 | Mini App 2.0 (fullscreen, main app), affiliate program, verifikasi pihak ketiga, `sendGift` |
| 9.0 | 11 Apr 2025 | Manajemen akun bisnis penuh, unique gifts |
| 9.1 | 3 Jul 2025 | **Checklists** (business-only), `getMyStarBalance` |
| 9.2 | 15 Agu 2025 | Channel direct messages, suggested posts (batas typing `@telegraf/types` 9.2.1) |
| 9.3 | 31 Des 2025 | **`sendMessageDraft`** — streaming jawaban AI (private chat) |
| 9.4 | 9 Feb 2026 | `setMyProfilePhoto`, styled buttons, `ChatOwnerChanged` |
| 9.5 | 1 Mar 2026 | **Member tags** (`setChatMemberTag`), entity `date_time` |
| 9.6 | 3 Apr 2026 | Quiz multi-jawaban (`correct_option_ids`), `allows_revoting`, managed bots |
| 10.0 | 8 Mei 2026 | **Moderasi reaction** (`deleteMessageReaction`/`deleteAllMessageReactions`), `can_react_to_messages`, guest mode, poll media, `getChatAdministrators(return_bots)` |
| 10.1 | 11 Jun 2026 | **Rich Messages** (`sendRichMessage` — tabel/kode/list/thinking block), **guard bot** join-request queries + Mini App captcha |
| 10.2 | 14 Jul 2026 | **Ephemeral messages** (pesan grup yang hanya dilihat 1 user), Communities |
| 10.3 | 24 Agu 2026 | `EphemeralMessageParameters` di 13 method kirim, `BotCommand.is_ephemeral`, hak admin `can_send_welcome_messages`, `DisabledButton`, tombol rich message |

### Status Telegraf

- `telegraf` npm latest: **4.16.3** (29 Feb 2024) — dependensi `@telegraf/types ^7.1.0`, `node-fetch@2`. 66 issue terbuka; last commit v4: Jan 2025. Rilis 4.16.0 menyebut dirinya "the last major update for v4"; branch v5 mati sejak Mar 2023.
- `@telegraf/types` standalone: **9.2.1** (Sep 2025) — typing sampai Bot API 9.2, bisa dipasang berdampingan.
- Bug terbuka yang relevan: **#2094** — `reply_parameters` hilang saat kirim media multipart (reply + foto = reply-nya lenyap); **#2096** — `ctx.telegram` bukan instance yang sama dengan `bot.telegram`; masih pakai node-fetch v2.
- **grammY 1.46.0** (26 Agu 2026): support Bot API 10.3, rilis bulanan, plugin auto-retry & ratelimit bawaan, API sangat mirip. Untuk proyek baru 2026 yang butuh fitur baru, grammY adalah default yang lebih aman; Telegraf tetap layak untuk fitur inti.

### Alternatif yang benar-benar ter-update (verifikasi live 28 Agu 2026)

| Framework | Versi | Terbit | Bot API | Catatan |
|---|---|---|---|---|
| **grammY** | 1.46.0 | 26 Agu 2026 | **10.3** | Framework penuh; tiap rilis Bot API 2026 diikuti dalam hitungan hari (1.43→10.0, 1.44→10.1, 1.45→10.2, 1.46→10.3 dua hari setelah rilis) |
| **node-telegram-bot-api v2** | 2.1.0 | 24 Agu 2026 | **10.3** | Redesign total dari nol: *client* TypeScript 1:1, types di-generate dari docs live, runtime-agnostic — bukan framework (tanpa session/router) |
| GramIO | 0.14.0 | 25 Agu 2026 | 9.5 (badge) | Muda (0.x), types code-generated |
| puregram | 3.9.1 | 25 Agu 2026 | tak terverifikasi | Aktif |
| telegraf | 4.16.3 | 29 Feb 2024 | 7.1 | Beku |

**grammY adalah pengganti alami Telegraf.** Plugin resminya persis menambal kelemahan Telegraf yang ditemukan riset ini: `auto-retry` (429/`retry_after` otomatis), `ratelimiter`, `runner` (update konkuren), `conversations` (pengganti Scenes), session + storage adapter yang dirawat. Runtime-agnostic (Node/Deno/Bun/Cloudflare Workers). Migrasi mental model murah: `bot.on(message('text'))` → `bot.on('message:text')`, `bot.action` → `bot.callbackQuery`, `Markup.inlineKeyboard` → `new InlineKeyboard()`, Scenes → `@grammyjs/conversations`, `bot.launch()` → `bot.start()`; `bot.command`/`ctx.reply`/`bot.catch` sama persis. Catatan: jebakan platform (§5) tetap berlaku di framework mana pun.

### Strategi menutup gap di Telegraf

```js
// package.json → paksa typing lebih baru (sampai Bot API 9.2)
// "overrides": { "telegraf": { "@telegraf/types": "^9.2.1" } }

// Wrapper kecil untuk method pasca-7.1 (Bot API 9.3–10.3):
const api = (ctx, method, payload) => ctx.telegram.callApi(method, payload);

// contoh: jawaban privat-di-grup (ephemeral, 10.2+)
await api(ctx, 'sendMessage', {
  chat_id: ctx.chat.id,
  text: 'Hanya kamu yang melihat pesan ini 👀',
  ephemeral_message_parameters: { receiver_user_id: ctx.from.id },
});
```

Update bertipe baru (`guest_message`, `subscription`, `stopped_message_generation`) tidak dikenal filter Telegraf — tangani lewat `bot.use()` dengan memeriksa `ctx.update` mentah.

---

## 3. Fitur baru paling menarik untuk asisten grup (2025–2026)

### ⭐ Ephemeral messages (10.2/10.3) — pembunuh spam grup nomor satu
Kirim pesan **di dalam grup yang hanya terlihat oleh satu user** (gaya Slack). Semua method kirim menerima `ephemeral_message_parameters: { receiver_user_id, callback_query_id?, replace_callback_query_message? }`. Ada method edit/delete khusus (`editEphemeralMessageText`, `deleteEphemeralMessage`), reply harus dalam 15 detik dan ikut ephemeral, dan `BotCommand.is_ephemeral` menandai command yang balasannya privat. Pakai untuk: /help, feedback command, peringatan moderasi, panel setting pribadi — tanpa menyepamkan grup atau butuh izin DM. Catatan: delivery tidak dijamin bila user offline.

### ⭐ Rich Messages (10.1) — jalur native untuk jawaban AI
`sendRichMessage` **bekerja di grup** dan menerima salah satu dari: `markdown` mentah, `html`, atau array `blocks` (±24 tipe: tabel, list, kode, expandable, kolase, peta, rumus matematika, tombol, blok *Thinking*). Artinya output LLM bisa dikirim **tanpa escaping MarkdownV2** sama sekali. `editMessageText` juga menerima `rich_message` — bisa streaming teks biasa dulu, lalu edit final jadi rich. `sendRichMessageDraft`/`sendMessageDraft` (streaming token + tombol stop → update `stopped_message_generation`) **masih khusus private chat** sampai 10.3.

### ⭐ Guard bot & join-request queries (10.1) — captcha native
Bot bisa ditunjuk sebagai **guard bot** grup (`ChatFullInfo.guard_bot`). Tiap `chat_join_request` datang dengan `query_id`, dan bot **wajib menjawab dalam 10 detik**: `answerChatJoinRequestQuery(query_id, 'approve'|'decline'|'queue')` atau tampilkan captcha Mini App via `sendChatJoinRequestWebApp`. Ini pengganti resmi pola "mute-on-join captcha" — user diverifikasi **sebelum** masuk grup, tanpa celah spam. Karena deadline 10 detik keras, lookup reputasi (mis. CAS) harus di-cache; kalau ragu jawab `queue` (serahkan ke admin manusia).

### ⭐ Member tags (9.5) — label anggota native
`setChatMemberTag(chat_id, user_id, tag)` (0–16 karakter, tanpa emoji; butuh hak admin baru `can_manage_tags`). Tag tampil di samping nama di semua pesan (`message.sender_tag`). Pakai untuk: "Verified", "Helper", "Warned 2/3", juara kuis mingguan — reputasi tanpa mempromosikan siapa pun jadi admin.

### ⭐ Moderasi reaction (10.0)
`deleteMessageReaction` / `deleteAllMessageReactions` (hapus s.d. 10.000 reaction terakhir milik satu user — butuh `can_delete_messages`), plus `can_react_to_messages` di `ChatPermissions` untuk *reaction-mute*. Bot sendiri bisa `setMessageReaction` (maks 1 reaction, tanpa paid reaction) — cara termurah meng-acknowledge command tanpa mengirim pesan.

### Hak admin `can_send_welcome_messages` (10.3)
Infrastruktur ucapan selamat datang resmi: pesan sambutan yang hanya dilihat member baru — tidak perlu lagi post greeting yang menspam grup.

### Lainnya yang layak dicatat
- **Polls & kuis (9.6/10.0)**: 12 opsi, multi-jawaban (`correct_option_ids`), `allows_revoting`, `shuffle_options`, media di opsi, `open_period` s.d. 1 bulan, `hide_results_until_closes`, `allow_adding_options` (kotak saran kolaboratif).
- **Guest mode (10.0)**: bot bisa dipanggil (@mention) di grup yang **belum memasangnya** — jawab via `answerGuestQuery`. Loop pertumbuhan gratis.
- **Entity `date_time` (9.5)**: Telegram menandai timestamp di teks user (`entity.unix_time`) — fitur reminder tanpa parsing tanggal NLP.
- **Communities (10.2)**: event saat grup bergabung/keluar dari community (`community_chat_joined` dll).
- **Tombol baru**: `style` (danger merah / success hijau / primary biru), `disabled` (tombol non-aktif — mis. voting yang sudah ditutup), `copy_text`, `icon_custom_emoji_id`.
- **Checklists (9.1)**: **hanya via business connection** — bot grup biasa dapat 400. Emulasikan dengan inline keyboard (emoji checkbox + callback), tapi bot tetap bisa *membaca* checklist yang diposting user.
- **Message effects: private-chat-only** — di grup gunakan `setMessageReaction(..., is_big: true)` sebagai gantinya.
- **Stars & monetisasi**: invoice `XTR` (provider_token kosong, 1 item harga) jalan di grup; `createChatSubscriptionInviteLink` = grup berbayar bulanan (Stars) yang ditagih otomatis Telegram; `sendPaidMedia` (konten bayar-untuk-buka, hasil ke saldo bot); `sendGift` ke user (bukan ke grup) untuk hadiah leaderboard; `getMyStarBalance`.
- **Mini Apps di grup**: ketiga tombol `web_app` (inline, keyboard, menu) **hanya untuk private chat**. Di grup gunakan tombol URL biasa ke `https://t.me/NamaBot/namaapp?startapp=...`, atau alur captcha `sendChatJoinRequestWebApp`. Sejak 20 Jul 2026 Mini App dilarang cross-origin (di-enforce otomatis) — audit app lama.

---

## 4. Fondasi moderasi & manajemen grup

### Privacy mode & apa yang dilihat bot
Default **ON**: bot hanya menerima command yang ditujukan padanya (`/cmd@bot`), reply ke pesannya, pesan via-inline, dan service messages. **@mention teks biasa TIDAK diterima** saat privacy on. Solusi untuk asisten yang perlu membaca semua pesan (moderasi, konteks AI): jadikan bot **admin** (mengesampingkan privacy mode) atau `/setprivacy` off di BotFather (harus di-remove & re-add ke grup agar efek). Bot **tidak pernah** melihat pesan bot lain.

### `allowed_updates` — jebakan diam-diam terbesar
List kosong (default) = semua tipe **kecuali** `chat_member`, `message_reaction`, `message_reaction_count`. Telegraf juga default `[]`. Wajib eksplisit:

```js
bot.launch({
  allowedUpdates: [
    'message', 'edited_message', 'callback_query', 'inline_query',
    'my_chat_member', 'chat_member', 'chat_join_request',
    'message_reaction', 'poll', 'poll_answer',
  ],
});
```

`chat_member` (butuh bot admin) adalah **satu-satunya sinyal join/leave yang andal** — service message `new_chat_members` disembunyikan di supergroup besar. Deteksi join: `old.status ∈ {left, kicked}` → `new.status ∈ {member, restricted(is_member)}`. `my_chat_member` memberi tahu saat bot dipromosikan/di-demote — pakai untuk cache hak sendiri.

### Hak admin & permission
- `promoteChatMember` punya ±19 flag. Minimum untuk asisten moderasi: `can_delete_messages`, `can_restrict_members`, `can_invite_users`, `can_pin_messages`; opsional `can_manage_topics`, `can_manage_tags` (9.5), `can_send_welcome_messages` (10.3). Set `setMyDefaultAdministratorRights` agar owner grup memberi hak yang tepat sekali klik; deep link `t.me/Bot?startgroup=x&admin=delete_messages+restrict_members` juga bisa pre-select hak.
- `ChatPermissions` punya 16 flag granular. **Awas aturan implikasi**: tanpa `use_independent_chat_permissions: true`, `can_send_other_messages` menyeret semua izin kirim ikut ter-grant.
- Mute: `restrictChatMember(..., { permissions: { can_send_messages: false }, until_date })` — **supergroup only**. Unmute: semua `true`, atau salin `getChat().permissions` agar tidak memberi lebih dari default grup.
- **Aturan `until_date`**: < 30 detik atau > 366 hari dari sekarang = **permanen**. Clamp input user (mis. min 35 detik, maks 365 hari). Telegram meng-enforce `until_date` **di server** — mute 24 jam tetap jalan walau bot mati; tidak perlu scheduler sendiri.
- Ban: `banChatMember(..., revoke_messages: true)` menghapus **seluruh** riwayat pesan si spammer (tanpa perlu melacak message_id). Soft-kick = ban lalu segera unban. **Jebakan**: `unbanChatMember` default juga *menendang member aktif* — selalu `only_if_banned: true` di handler /unban.
- `banChatSenderChat` untuk spam berkedok channel (tidak ada user_id yang bisa diban).

### Pembersihan pesan
`deleteMessage`: hanya pesan < **48 jam**; admin supergroup dengan `can_delete_messages` bisa hapus pesan siapa pun. `deleteMessages`: batch **1–100 id**, id yang tak ketemu di-skip (idempoten, aman di-retry). Untuk spam lama > 48 jam: `banChatMember(revoke_messages: true)`.

### Join request & invite link
- Invite link `creates_join_request: true` (eksklusif dengan `member_limit`) → setiap calon member memicu `chat_join_request` (bot butuh `can_invite_users`).
- `ChatJoinRequest.user_chat_id` = jendela **5 menit** untuk DM captcha ke pemohon tanpa dia perlu /start duluan.
- Link bisa diberi `name` (0–32) — lacak sumber join per link (`ChatMemberUpdated.invite_link`) untuk forensik raid; revoke link yang bocor.

### Forum topics
CRUD penuh (`createForumTopic` dst — semuanya sudah dibungkus Telegraf). Wajib meneruskan `message_thread_id` di setiap balasan atau jawaban nyasar ke General (ctx.reply Telegraf otomatis menangani ini). Bot bisa bikin topic sendiri, mis. "mod-log".

### Data grup: `getChat()` → `ChatFullInfo`
Snapshot konfigurasi: `permissions` default, `slow_mode_delay`, `unrestrict_boost_count` (booster melewati slow mode & restriction default!), `has_aggressive_anti_spam_enabled`, `join_by_request`, `is_forum`, `linked_chat_id`, `guard_bot`, `community`, `paid_message_star_count`. **Tidak ada method bot** untuk menyetel slow mode / aggressive anti-spam — read-only.

---

## 5. Jebakan klasik yang wajib ditangani

1. **Admin anonim** → `from` palsu **@GroupAnonymousBot (id 1087968824)**, `sender_chat` = grup itu sendiri. Jangan hitung warn/XP terhadap id itu (itu semua admin anonim sekaligus). Deteksi: `msg.sender_chat?.id === msg.chat.id`.
2. **Auto-forward channel tertaut** → `is_automatic_forward: true`, `from` = user layanan **777000**, `sender_chat` = channel. Jangan pernah captcha/hapus — whitelist `sender_chat.id === linked_chat_id`.
3. **`ctx.from` bisa undefined** (channel_post) atau palsu — guard setiap handler yang menyentuhnya. Ini bug bot grup paling umum.
4. **Migrasi group → supergroup** mengganti `chat_id` secara permanen. Tangani dua jalur: service message `migrate_to_chat_id` DAN error 400 dengan `response.parameters.migrate_to_chat_id` → tulis-ulang semua data ber-key chat_id + retry sekali. Simpan chat id sebagai angka 64-bit-safe (JS Number aman s.d. 52 bit; id supergroup negatif `-100…`).
5. **Captcha tombol**: siapa pun bisa memencet tombol — selalu bandingkan `ctx.callbackQuery.from.id` dengan user yang ditantang.
6. **Session race**: dua /warn bersamaan bisa saling menimpa. Telegraf ≥ 4.12 aman **dalam satu proses** saja (PR #1713); di cluster/multi-replica proteksi hilang. Counter panas → operasi atomik DB (`INCR`, `ON CONFLICT ... SET warns = warns + 1`), bukan session. Kalau webhook + session: **wajib** `webhookReply: false`.
7. **Bug Telegraf #2094**: `reply_parameters` hilang di request multipart — reply + upload media tidak jadi reply. Workaround: kirim media by URL/file_id, atau pisahkan.
8. **`bot.launch()` polling tidak pernah resolve** — jangan `await bot.launch()` lalu baru start health server (deadlock). Polling juga otomatis **menghapus webhook** di token yang sama: jangan pernah jalankan polling dev dengan token prod (juga memicu perang 409 antar-instance — hanya boleh ada 1 poller per token; pakai token BotFather terpisah untuk dev).
9. **`bot.catch` wajib** — tanpa itu, satu handler yang throw (mis. 403 karena user memblokir bot) mematikan proses. Telegraf juga **tidak auto-retry 429** untuk send — tangani `err.code === 429` + `parameters.retry_after` sendiri.
10. **Backlog 24 jam**: update tersimpan maks 24 jam; setelah bot down lama, `dropPendingUpdates: true` agar tidak menjawab pertanyaan basi di grup.

---

## 6. Telegraf: konsep inti

- **Middleware Koa-style** `(ctx, next)` — tempat ideal untuk cross-cutting: cek admin (cache `getChatAdministrators`, refresh saat `chat_member`), rate limit per user, muat setting grup ke `ctx.state`.
- **Filter modern**: `import { message, callbackQuery, anyOf, allOf } from 'telegraf/filters'` → `bot.on(message('text'))` (type-narrowing). Bentuk lama `bot.on('text')` deprecated.
- **Composer**: modul fitur terpisah (`moderation.js`, `greeting.js`, `ai.js`) lalu `bot.use(mod)`. `bot.command` otomatis menangani `/cmd@NamaBot`; `bot.mention('NamaBot')` = hook "panggil asisten"; `bot.reaction(...)` untuk update reaction.
- **Session**: key default `${from.id}:${chat.id}` (per-user-per-grup). Untuk **setting per grup** pakai session kedua: `session({ property: 'chatSession', getSessionKey: ctx => ctx.chat?.id.toString(), store })`. Default store **in-memory — hilang saat restart**; produksi wajib store persisten. `@telegraf/session` (Redis/Postgres/SQLite/Mongo/MySQL) masih **2.0.0-beta.7** (Jan 2024) — berfungsi, tapi interface `SessionStore` cuma get/set/delete: menulis adapter 20 baris di atas DB sendiri sering lebih aman.
- **Scenes/Wizard**: alur multi-langkah (mis. /setup welcome → rules → bahasa). Butuh `session()` terdaftar duluan. Untuk konfigurasi grup, lebih bersih menjalankan wizard di DM admin, hasil disimpan ber-key id grup.
- **Markup**: di grup pakai **inline keyboard** (menempel per pesan), bukan reply keyboard (mengganti keyboard semua member). `callback_data` maks **64 byte**. Selalu `ctx.answerCbQuery()` agar spinner klien berhenti.
- **Format**: `import { fmt, bold, code, pre } from 'telegraf/format'` membangun entity langsung — **tanpa escaping sama sekali**; opsi paling tahan banting untuk teks buatan bot.
- **Webhook**: `bot.launch({ webhook: { domain, port, secretToken } })`, atau `app.use(await bot.createWebhook({ domain }))` di Express (verifikasi header `X-Telegram-Bot-Api-Secret-Token` pakai constant-time compare). Webhook = boleh multi-replica; polling = single instance saja.
- **Shutdown**: `process.once('SIGINT', () => bot.stop('SIGINT'))` dst. `bot.stop()` pada polling meng-ACK batch terakhir sehingga restart tidak memproses ulang. Di Docker pastikan `CMD ["node","bot.js"]` (bukan `npm start` yang menelan sinyal).

---

## 7. Menyambungkan AI/LLM ke grup

- **Streaming**: `sendMessageDraft`/`sendRichMessageDraft` (native, ada tombol stop) **hanya private chat**. Di grup: kirim placeholder → `editMessageText` ber-throttle (**budget ±20 edit/menit per grup**, jadi edit tiap 3–5 detik, skip bila buffer tak berubah, satu edit final). Bungkus dengan `ctx.persistentChatAction('typing', ...)` (re-send tiap 4 detik).
- **Formatting output model**: paling aman (a) `sendRichMessage` dengan `rich_message: { markdown: teksModel }` — tanpa escaping, tabel & kode render native; atau (b) konversi ke **HTML** (escape hanya `& < >`); MarkdownV2 (18 karakter wajib di-escape) adalah sumber error 400 nomor satu. Fallback: bila 400 parse error, kirim ulang tanpa parse_mode.
- **Chunking**: teks maks **4096** karakter (caption 1024) — potong di batas paragraf, jangan di tengah tag/fence; sisakan margin ±4000.
- **Trigger di bawah privacy mode**: (1) command, (2) reply ke pesan bot — dua ini selalu jalan; (3) @mention hanya jalan bila bot admin/privacy off. Kalau mau "konteks ambient" (bot mengingat obrolan), bot harus melihat semua pesan → jadikan admin dan **disclose** ke grup.
- **Memori per grup**: session ber-key `chat.id` (+ `:message_thread_id` di forum agar topic tidak saling bocor), simpan transcript bergulir terbatas, persist ke Redis/SQLite.
- **Rate limit internal**: token bucket per `${chat.id}:${from.id}` (mis. 3 request LLM/menit/user) + cap konkurensi per grup (1–2 generasi bersamaan) agar tidak berebut budget edit. `telegraf-ratelimit` npm sudah purba (2017) — tulis sendiri.
- **Serialisasi kirim per grup** lewat satu promise queue; 429 di satu call tidak menghentikan call paralel lain, jadi antrian per chat itu penting.

---

## 8. Operasional & deployment

### Rate limit resmi (FAQ)
- ±**1 pesan/detik per chat**, **20 pesan/menit per grup** (edit ikut budget ini), ±**30 pesan/detik global**.
- 429 → `parameters.retry_after` (detik) — patuhi persis; retry kepagian memperpanjang hukuman.
- `allow_paid_broadcast`: s.d. 1000 msg/detik seharga 0,1 Stars/pesan (untuk broadcast massal saja).

### Batas ukuran
- Teks 4096 / caption 1024 (setelah parsing entity).
- File: download 20 MB, upload 50 MB (foto 10 MB). **Self-host `tdlib/telegram-bot-api`** (`--local`) melepas batas: download tanpa limit, upload 2000 MB, webhook HTTP/port bebas — arahkan Telegraf via `new Telegraf(token, { telegram: { apiRoot: 'http://localhost:8081' } })`.
- Link `getFile` kedaluwarsa ±1 jam; kirim ulang pakai `file_id` (tanpa batas ukuran, tanpa re-upload).

### Commands
`setMyCommands` per scope: `all_group_chats` untuk member, `all_chat_administrators` untuk command moderasi (member biasa tidak melihatnya di menu /), `chat`/`chat_member` untuk per-grup. Tandai command query `is_ephemeral` (10.3). Set `setMyDescription` (512) / `setMyShortDescription` (120) dari CI.

### Webhook vs polling
- **Polling**: paling sederhana (tanpa domain/TLS), cukup untuk satu proses. Ingat: 1 poller per token (409), deploy strategy *stop-then-start*.
- **Webhook**: wajib port 443/80/88/8443 + TLS valid; `secret_token` wajib diverifikasi; `max_connections` 1–100 (default 40); pengiriman *at-least-once* (idempotensi per `update_id`). Topologi standar: Caddy/nginx (Let's Encrypt) → Node internal. Boleh N replica di belakang LB — asal session/state eksternal.
- Debug produksi: `getWebhookInfo` (`pending_update_count` naik + `last_error_message` = alasan bot "diam").
- Serverless: Lambda oke untuk bot sepi (pola resmi `serverless-http` + `bot.webhookCallback`); Cloudflare Workers **tidak didukung** (Telegraf Node-only; shim pihak ketiga diarsipkan 2024). Bot grup yang ramai paling enak di host kecil always-on (VPS/Fly.io/container).

### Arsitektur state
- **Counter panas** (warn, flood, statistik): operasi atomik DB langsung di handler — race-free lintas proses.
- **Setting grup** (read-mostly): tabel ber-key chat_id + cache TTL di middleware.
- **Session Telegraf**: hanya untuk state percakapan kontensi-rendah.
- **Timer tahan-restart**: mute/ban → `until_date` (Telegram yang enforce, gratis). Hapus pesan terjadwal & pengumuman → job queue persisten: **pg-boss 12.x** (Postgres, `startAfter` + `singletonKey`, exactly-once) atau **BullMQ 6.x** (Redis, delayed jobs + `jobId` dedup). Saat startup: rekonsiliasi (drop job delete > 48 jam; `getChatMember` untuk verifikasi mute aktif).

### Anti-abuse pattern (ringkas)
- **Gerbang join** (terbaik): grup join-by-request / link `creates_join_request` → captcha via DM (`user_chat_id`, 5 menit) atau guard-bot Mini App (10.1) → approve/decline. User tak pernah ada di grup sebelum lolos.
- **CAS (Combot Anti-Spam)**: `GET https://api.cas.chat/check?user_id=…` — `ok: true` = terdaftar ban. Cache positif lama, miss ±1 jam, timeout pendek fail-open; di alur guard-bot jawab `queue` bila CAS belum merespons dalam deadline 10 detik.
- **Deteksi raid**: sliding window join per grup (mis. >10 join/60 detik, tersegmentasi per invite link) → lockdown: snapshot `getChat().permissions` **sebelum** `setChatPermissions` all-false (tidak ada "undo" otomatis), revoke link bocor, mode decline-all join, `banChatMember(revoke_messages: true)` untuk spammer terkonfirmasi.
- **Eskalasi warn**: (chat_id, user_id) → count + expiry; threshold → mute bertingkat (1 jam, 1 hari) → ban. Sebelum bertindak: tolak bila target admin/creator (cache `getChatAdministrators`) atau pesan ber-`sender_chat`.

---

## 9. Rekomendasi arsitektur SotongAssistant

**Stack:**
- `telegraf@4.16.3` (sesuai preferensi) + override `@telegraf/types@^9.2.1` + modul `api/raw.js` berisi wrapper `callApi` bertipe tangan untuk fitur 9.3–10.3 (ephemeral, rich message, guard bot, member tags, reaction moderation). *Catatan jujur: bila roadmap sangat bergantung fitur 2024+, pertimbangkan grammY sebelum kode membesar — API-nya mirip sehingga migrasi dini murah.*
- Storage: SQLite (better-sqlite3) untuk mulai / Postgres bila serius; Redis opsional untuk queue. Session store custom 20-baris di atas DB yang sama.
- Job queue: pg-boss (jika Postgres) atau BullMQ (jika Redis) untuk delete terjadwal & pengumuman.
- Deploy awal: 1 proses, long polling, `bot.catch` + pm2/systemd/Docker-init; pindah webhook (Caddy → Node) saat butuh skala/latensi.

**Checklist boot:**
1. `allowedUpdates` eksplisit (lihat §4).
2. `my_chat_member` handler → cache hak admin bot per grup; peringatkan owner bila hak kurang.
3. `setMyCommands` per scope + `setMyDefaultAdministratorRights`.
4. Tangani `migrate_to_chat_id` (service message + error 400) sejak hari pertama.
5. Guard `ctx.from` undefined / `sender_chat` di semua handler.

**Fitur MVP yang didukung penuh API (urutan usul):**
1. Moderasi: /warn /mute /ban /unban(only_if_banned) /purge (deleteMessages batch) + eskalasi otomatis.
2. Onboarding: join-request gate + captcha (klasik dulu, guard-bot 10.1 menyusul) + welcome (hak 10.3 bila di-grant, fallback pesan biasa auto-delete).
3. Asisten AI: trigger command/reply/mention, pseudo-streaming edit, jawaban final `sendRichMessage(markdown)`, jawaban personal via ephemeral.
4. Engagement: kuis multi-jawaban, leaderboard reaction-karma (`message_reaction`), member tags untuk juara, dice mini-games.

---

## 10. Catatan sumber & tingkat keyakinan

- `core.telegram.org`, `t.me`, dan `telegraf.js.org` **terblokir egress proxy** lingkungan riset ini. Fakta diverifikasi via: mirror spec resmi yang di-scrape otomatis (`github.com/PaulSonOfLars/telegram-bot-api-spec`, menyatakan "Bot API 10.3, August 24, 2026"; 185 method, 400 type), registry npm live, clone repo `telegraf/telegraf` & `tdlib/telegram-bot-api`, serta changelog library yang melacak tiap rilis (go-telegram/bot, python-telegram-bot, grammY, vendelieu, TBXark).
- Mayoritas fakta terkonfirmasi ≥2 sumber independen. **Single-source (keyakinan sedang):** tanggal persis 9.5/9.6/10.0; klaim "sendMessageDraft dibuka untuk semua chat type di 9.5" (bertentangan dengan spec 10.3 yang masih menyebut private-only — **pegang yang private-only**); angka "±20 edit/menit per grup" (dokumentasi grammY mengutip tdlibchat, bukan FAQ resmi).
- Sebelum mulai koding, cek ulang `https://core.telegram.org/bots/api-changelog` dari jaringan normal — irama rilis 2026 hampir bulanan.
