<div align="center">

# 🦑 SotongAssistant

**Telegram için hepsi-bir-arada asistan — moderasyon, akıllı karşılama, kanallar,
Telegram Business ve [models.dev](https://models.dev) kataloğundaki her modelle yapay zekâ.
Bütün ayarlar Telegram'ın içinde. Web paneli yok.**

🌐 [English](../../README.md) · [Bahasa Indonesia](README.id.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Português](README.pt.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Українська](README.uk.md)

</div>

---

## ✨ Özellikler

| | Yetenek | Ayrıntılar |
|---|---|---|
| 🪄 | **Eyleme geçen YZ** | Yöneticiler sadece **doğal dille söyler** — “onu 2 saat sustur”, “captcha'yı aç”, “anket: öğle yemeği?”, “gece modu 23:00-06:00” — bot uygular: beyaz listede 30+ eylem, her biri sunucuda yeniden doğrulanır (yalnız yöneticiler, korunan hedefler, mesaj başına en çok 3) makbuzla · ayrıca `/imagine`, `/approve`, `/aiquota` ve karşılamada URL düğmeleri |
| 🤖 | **Yapay zekâ asistanı** | `/ask`, bota yanıt ya da @etiket · satır içi menülerle **models.dev'deki her sağlayıcı ve modeli** seç · akış hâlinde yanıtlar · sohbete özel kişilik (`/aiprompt`) · grup özeti için `/summarize` |
| 🧠 | **Katmanlı hafıza** | Kısa vadeli transkript **artı** modelin kendisinin koruduğu uzun vadeli özet (OpenClaw/Hermes tarzı) · grup *ve* konu başına · `/memory`, `/forget` |
| 🛡 | **Moderasyon** | Otomatik tırmanan `/warn` · `/mute 2h` (Telegram sunucuları uygular — yeniden başlatmadan etkilenmez) · `/ban` + tüm mesajları silme · güvenli `/unban` · `/purge` · `/lockdown` ve `/unlock` · `/info`, `/report` |
| 👋 | **Karşılama** | `chat_member` ile güvenilir katılım tespiti · karşılama mesajları (otomatik temizlik) · zaman aşımında atan düğme captcha · özelde doğrulanan katılma istekleri |
| 🌊 | **Kötüye kullanım önleme** | Anti-flood otomatik susturma · kanal kimliğiyle spam engelleme (bağlı kanal beyaz listede) · anonim yönetici ve otomatik iletme farkındalığı |
| 📒 | **Notlar ve kurallar** | `/save faq` → `#faq` ile çağır · `/setrules` ve `/rules` |
| 🎲 | **Eğlence** | Zar/dart/slot · `/poll` ve çok yanıtlı `/quiz` · `/remind 10m …` · Telegram Stars ⭐ ile `/donate` |
| 📣 | **Kanallar** | Yönettiği kanalları izler, `/ping` |
| 💼 | **Telegram Business** | Sahibi adına müşteri sohbetlerini yapay zekâ ile yanıtlar (hız ve eşzamanlılık sınırlı) |
| 📋 | **Bot yöneticisi** | `/status`: tüm sohbetler + her birindeki bot yetkileri · süper gruba geçiş otomatik |
| 🧹 | **Mesaj hijyeni** | **Anahtar kelime filtreleri** (`/filter`), anında silme ile **kelime engel listesi** (`/block`), davet bağlantısı silme · tek dokunuş moderasyon paneli `/mp` (geçici) |
| 🤝 | **Federasyonlar** | **Gruplar arası ortak ban listeleri**: her grupta `/newfed` → `/joinfed` · `/fban` hepsinde birden yasaklar ve katılırken otomatik atar |
| 🌍 | **Çeviri** | `/tr` (yanıtla) mesajı çevirir · `/bridge de` çok dilli gruplarda yabancı mesajları otomatik çevirir |
| 📊 | **İstatistik ve temeller** | `/stats` etkinlik grafiği ve en aktifler · `/recall` mesaj arama · `/afk` · `/ping` `/uptime` `/about` `/admins` `/invite` |
| 🔎 | **Inline ve dahası** | `@botname soru` — **herhangi bir sohbetten** YZ'ye sorun · YZ **kendini bilir** (sürüm, komutlar, sohbet ayarları) · **kendi kendine güncelleme** (`/update`, `AUTO_UPDATE=true`) · kanallar için `/subscription` Stars abonelikleri |
| 🌙 | **Gece modu ve saat dilimi** | `/night 23:00-06:00` grubu sohbetin yerel saatinde (`/settz Europe/Istanbul`) her gün kilitler; duyurular ve izinlerin birebir geri yüklenmesiyle |
| 🔞 | **NSFW filtresi** | Sohbetin çok modlu modeliyle fotoğraflar ve çıkartma/video küçük resimleri için isteğe bağlı YZ taraması — NSFW silinir ve uyarı eskalasyonuna girer; fail-open |
| 👑 | **Yönetici araçları** | `/promote` `/demote` `/title` · `/warnmode` (sustur/at/yasakla) · “@admin” yöneticileri çağırır · `/tagall` · `/disable` ile komut kapatma · `/antilink off\|invites\|all` + `/allowlink` · forum konuları (`/newtopic` vb.) · `{mention}` `{count}` yer tutuculu welcome/goodbye |
| 🧰 | **Her şey dahil, tamamen inline** | `/lock` — 12 medya türü · `/schedule` — yerel saatte zamanlanmış mesaj · DM'deki sesli notlar çevrilir (Whisper) ve yanıtlanır, gruplarda `/transcribe` · `/unote` — `/info` içinde dosya · `/fexport`/`/fimport` + federasyon yöneticileri · `/import` — yedek geri yükleme · `/paidpost` — Stars ücretli medya · `/settings` paneli tamamen düğmeli (kilit alt menüsü dahil) |
| 🌐 | **10 dil** | Kullanıcının Telegram'ından otomatik algılama, `/lang` ile sohbet başına değiştirilebilir |

**Her şey Telegram içinde yapılandırılır**: `/settings` her grubun satır içi
menüsünü açar. API anahtarları bota özel mesajla ayarlanır — asla bir dosyada,
asla bir grupta değil.

## 🚀 Hızlı başlangıç

> **Gereksinimler:** Node.js ≥ 20 ve [@BotFather](https://t.me/BotFather)'dan bir token.

```bash
git clone https://github.com/TegarTheGreat/SotongAssistant.git
cd SotongAssistant
cp .env.example .env        # BOT_TOKEN ve OWNER_ID doldur
npm install
npm run dev                 # veya: npm start
```

Sonra Telegram'da:

1. **Bota özelden yaz** → `/setkey anthropic sk-ant-…` (yalnız sahip; mesaj anında silinir, anahtar şifreli saklanır).
2. **Botu bir gruba ekle** ve **yönetici** yap (mesaj silme, kısıtlama, davet, sabitleme). Yönetici olmadan tüm mesajları göremez (privacy mode).
3. Grupta: her şey için `/settings`, model seçmek için `/aimodel`.
4. *(İsteğe bağlı)* **Business**: *Ayarlar → Telegram Business → Sohbet Botları* üzerinden bağla.

### Yapılandırma

| Değişken | Zorunlu | Anlamı |
|---|---|---|
| `BOT_TOKEN` | ✅ | @BotFather token'ı |
| `OWNER_ID` | ✅ | Telegram user id'in (bkz. `/id`) |
| `SECRET_KEY` | – | Saklanan API anahtarlarının şifreleme anahtarı |
| `DATA_DIR` | – | SQLite ve önbellek dizini (varsayılan `./data`) |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL` | – | Varsayılan model (`anthropic` / `claude-opus-5`) |
| `ANTHROPIC_API_KEY` vb. | – | env üzerinden anahtarlar (adlar models.dev'e göre) |

## 📦 Dağıtım

**Docker (önerilen):**

```bash
cp .env.example .env
docker compose up -d --build
```

SQLite veritabanı `./data` içinde kalıcıdır. **Token başına tek replika** çalıştır — Telegram eşzamanlı polling'i 409 ile reddeder.

**systemd / PM2:** tam unit dosyası [ana README'de](../../README.md#-deployment). Özet: `pm2 start "npx tsx src/main.ts" --name sotong --kill-timeout 10000`.

## 🔐 Güvenlik

- API anahtarları **şifreli saklanır** (AES-256-GCM); yalnız sahip, yalnız özelden ayarlayabilir ve anahtarı içeren mesaj anında silinir.
- Kullanıcı metinleri gösterilmeden önce escape edilir; sistem istemi modele kullanıcı metnini talimat değil içerik saymasını söyler.
- Moderasyon komutları yönetici durumunu doğrular, yöneticileri ve botu hedef almaz; anonim yöneticileri, kanal kimliklerini ve bağlı kanal iletmelerini anlar.
- "Tüm mesajları oku" (`/summarize` için) grup başına **açık onay** ister, varsayılan kapalı.
- Yapay zekâya giden her yolda hız sınırı.

## 🏗 Mimari ve araştırma

Kod yapısı, kararlar ve yol haritası: [ana README](../../README.md#-architecture).
Platform araştırmasının tamamı: [`docs/riset-telegram.md`](../riset-telegram.md).

## 📄 Lisans

MIT
