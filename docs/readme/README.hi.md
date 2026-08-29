<div align="center">

# 🦑 SotongAssistant

**टेलीग्राम के लिए ऑल-इन-वन असिस्टेंट — मॉडरेशन, स्मार्ट स्वागत, चैनल,
Telegram Business और [models.dev](https://models.dev) के किसी भी मॉडल से AI।
हर सेटिंग टेलीग्राम के अंदर। कोई वेब डैशबोर्ड नहीं।**

🌐 [English](../../README.md) · [Bahasa Indonesia](README.id.md) · [Русский](README.ru.md) · [Español](README.es.md) · [Português](README.pt.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md)

</div>

---

## ✨ विशेषताएँ

| | क्षमता | विवरण |
|---|---|---|
| 🤖 | **AI असिस्टेंट** | `/ask`, बॉट को reply या @mention · इनलाइन मेनू से **models.dev का कोई भी प्रोवाइडर और मॉडल** चुनें · स्ट्रीमिंग जवाब · हर चैट का अपना व्यक्तित्व (`/aiprompt`) · ग्रुप सार के लिए `/summarize` |
| 🧠 | **परतदार स्मृति** | अल्पकालिक ट्रांसक्रिप्ट **और** मॉडल द्वारा संधारित दीर्घकालिक सारांश (OpenClaw/Hermes शैली) · प्रति ग्रुप *और* प्रति टॉपिक · `/memory`, `/forget` |
| 🛡 | **मॉडरेशन** | स्वतः सख्त होते `/warn` · `/mute 2h` (Telegram सर्वर लागू करता है — रीस्टार्ट से बचता है) · `/ban` + सभी संदेश साफ़ · सुरक्षित `/unban` · `/purge` · `/lockdown` व `/unlock` · `/info`, `/report` |
| 👋 | **ऑनबोर्डिंग** | `chat_member` से भरोसेमंद जॉइन पहचान · स्वागत (स्वतः सफाई) · टाइमआउट-किक वाला बटन कैप्चा · DM में जॉइन-अनुरोध सत्यापन |
| 🌊 | **दुरुपयोग-रोधी** | एंटी-फ्लड स्वतः म्यूट · चैनल-स्पैम ब्लॉक (जुड़ा चैनल श्वेतसूची में) · गुमनाम एडमिन और ऑटो-फॉरवर्ड की समझ |
| 📒 | **नोट्स व नियम** | `/save faq` → `#faq` से बुलाएँ · `/setrules` व `/rules` |
| 🎲 | **मनोरंजन** | पासा/डार्ट्स/स्लॉट · `/poll` व बहु-उत्तर `/quiz` · `/remind 10m …` · Telegram Stars ⭐ से `/donate` |
| 📣 | **चैनल** | प्रबंधित चैनलों का लेखा, `/ping` |
| 💼 | **Telegram Business** | मालिक की ओर से ग्राहकों के चैट का AI उत्तर (दर व समांतरता सीमित) |
| 📋 | **बॉट मैनेजर** | `/status`: सभी चैट + हर एक में बॉट के अधिकार · सुपरग्रुप माइग्रेशन स्वतः |
| 🌐 | **10 भाषाएँ** | उपयोगकर्ता के Telegram से स्वतः पहचान, `/lang` से प्रति-चैट बदलें |

**सब कुछ टेलीग्राम के अंदर कॉन्फ़िगर होता है**: `/settings` हर ग्रुप का इनलाइन मेनू
खोलता है। API key बॉट को DM करके सेट होती है — कभी फ़ाइल में नहीं, कभी ग्रुप में नहीं।

## 🚀 त्वरित शुरुआत

> **आवश्यक:** Node.js ≥ 20 और [@BotFather](https://t.me/BotFather) से टोकन।

```bash
git clone https://github.com/TegarTheGreat/SotongAssistant.git
cd SotongAssistant
cp .env.example .env        # BOT_TOKEN और OWNER_ID भरें
npm install
npm run dev                 # या: npm start
```

फिर टेलीग्राम में:

1. **बॉट को DM करें** → `/setkey anthropic sk-ant-…` (केवल मालिक; संदेश तुरंत हटता है, key एन्क्रिप्टेड रहती है)।
2. **बॉट को ग्रुप में जोड़ें** और **एडमिन** बनाएँ (संदेश हटाना, प्रतिबंध, आमंत्रण, पिन)। बिना एडमिन वह सारे संदेश नहीं देख सकता (privacy mode)।
3. ग्रुप में: `/settings` सबके लिए, `/aimodel` से मॉडल चुनें।
4. *(वैकल्पिक)* **Business**: *Settings → Telegram Business → Chatbots* में जोड़ें।

### कॉन्फ़िगरेशन

| Env var | ज़रूरी | अर्थ |
|---|---|---|
| `BOT_TOKEN` | ✅ | @BotFather का टोकन |
| `OWNER_ID` | ✅ | आपका Telegram user id (`/id` देखें) |
| `SECRET_KEY` | – | सहेजी गई API keys की एन्क्रिप्शन कुंजी |
| `DATA_DIR` | – | SQLite व कैश डायरेक्टरी (डिफ़ॉल्ट `./data`) |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL` | – | डिफ़ॉल्ट मॉडल (`anthropic` / `claude-opus-5`) |
| `ANTHROPIC_API_KEY` आदि | – | env से फॉलबैक keys (नाम models.dev अनुसार) |

## 📦 डिप्लॉय

**Docker (अनुशंसित):**

```bash
cp .env.example .env
docker compose up -d --build
```

SQLite डेटाबेस `./data` में सुरक्षित रहता है। **प्रति टोकन एक ही replica** चलाएँ — समांतर polling को Telegram 409 से ठुकराता है।

**systemd / PM2:** पूरा unit [मुख्य README](../../README.md#-deployment) में। संक्षेप: `pm2 start "npx tsx src/main.ts" --name sotong --kill-timeout 10000`.

## 🔐 सुरक्षा

- API keys **एन्क्रिप्टेड** रहती हैं (AES-256-GCM); केवल मालिक, केवल DM में सेट कर सकता है, और key वाला संदेश तुरंत हटा दिया जाता है।
- हर उपयोगकर्ता-पाठ रेंडर से पहले escape होता है; सिस्टम प्रॉम्प्ट मॉडल को कहता है कि उपयोगकर्ता का पाठ सामग्री है, निर्देश नहीं।
- मॉडरेशन कमांड एडमिन स्थिति जाँचते हैं, एडमिन/बॉट को निशाना नहीं बनाते, और गुमनाम एडमिन, चैनल-पर्सोना व जुड़े चैनल के ऑटो-फॉरवर्ड समझते हैं।
- "सभी संदेश पढ़ें" (`/summarize` हेतु) हर ग्रुप में **स्पष्ट opt-in** है, डिफ़ॉल्ट बंद।
- AI तक हर रास्ते पर रेट-लिमिट।

## 🏗 आर्किटेक्चर व शोध

कोड संरचना, निर्णय और roadmap: [मुख्य README](../../README.md#-architecture)।
प्लेटफ़ॉर्म का पूरा शोध: [`docs/riset-telegram.md`](../riset-telegram.md)।

## 📄 लाइसेंस

MIT
