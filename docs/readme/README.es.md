<div align="center">

# 🦑 SotongAssistant

**El asistente todo-en-uno para Telegram — moderación, bienvenida inteligente,
canales, Telegram Business e IA con cualquier modelo de [models.dev](https://models.dev).
Toda la configuración vive dentro de Telegram. Sin panel web.**

🌐 [English](../../README.md) · [Bahasa Indonesia](README.id.md) · [Русский](README.ru.md) · [Português](README.pt.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md)

</div>

---

## ✨ Funciones

| | Capacidad | Detalles |
|---|---|---|
| 🤖 | **Asistente IA** | `/ask`, responder al bot o @mención · elige **cualquier proveedor y modelo de models.dev** con menús inline · respuestas en streaming · personalidad por chat (`/aiprompt`) · `/summarize` para resúmenes del grupo |
| 🧠 | **Memoria por capas** | Transcripción a corto plazo **más** un resumen a largo plazo mantenido por el propio modelo (estilo OpenClaw/Hermes) · por grupo *y* por topic · `/memory`, `/forget` |
| 🛡 | **Moderación** | `/warn` con escalada automática · `/mute 2h` (aplicado por los servidores de Telegram — sobrevive reinicios) · `/ban` + borrado total · `/unban` seguro · `/purge` · `/lockdown` y `/unlock` · `/info`, `/report` |
| 👋 | **Onboarding** | Detección fiable de entradas vía `chat_member` · bienvenidas (autolimpieza) · captcha de botón con expulsión por tiempo · verificación de solicitudes de entrada por privado |
| 🌊 | **Anti-abuso** | Anti-flood con silencio automático · bloqueo de spam de canales (canal vinculado en lista blanca) · entiende admins anónimos y reenvíos automáticos |
| 📒 | **Notas y reglas** | `/save faq` → recupera con `#faq` · `/setrules` y `/rules` |
| 🎲 | **Diversión** | Dados/dardos/tragaperras · `/poll` y `/quiz` multirespuesta · `/remind 10m …` · `/donate` con Telegram Stars ⭐ |
| 📣 | **Canales** | Registra los canales que administra, `/ping` |
| 💼 | **Telegram Business** | Responde chats de clientes con IA en nombre del dueño (con límites de frecuencia y concurrencia) |
| 📋 | **Gestor del bot** | `/status`: todos los chats + permisos del bot en cada uno · migración a supergrupo automática |
| 🌐 | **10 idiomas** | Autodetección desde el Telegram del usuario, sobrescribible por chat con `/lang` |

**Todo se configura dentro de Telegram**: `/settings` abre un menú inline por
grupo (bienvenida, captcha, IA, respuestas efímeras, anti-flood, contexto,
límite de avisos, idioma). Las API keys se configuran por privado — nunca en un
archivo, nunca en un grupo.

## 🚀 Inicio rápido

> **Requisitos:** Node.js ≥ 20 y un token de [@BotFather](https://t.me/BotFather).

```bash
git clone https://github.com/TegarTheGreat/SotongAssistant.git
cd SotongAssistant
cp .env.example .env        # rellena BOT_TOKEN y OWNER_ID
npm install
npm run dev                 # o: npm start
```

Después, en Telegram:

1. **Escribe al bot por privado** → `/setkey anthropic sk-ant-…` (solo el dueño; el mensaje se borra al instante y la key se guarda cifrada).
2. **Añade el bot a un grupo** y hazlo **admin** (borrar mensajes, restringir, invitar, fijar). Sin admin no ve todos los mensajes (privacy mode).
3. En el grupo: `/settings` para todo, `/aimodel` para elegir el modelo de IA.
4. *(Opcional)* **Business**: conéctalo en *Ajustes → Telegram Business → Chatbots*.

### Configuración

| Variable | Oblig. | Significado |
|---|---|---|
| `BOT_TOKEN` | ✅ | Token de @BotFather |
| `OWNER_ID` | ✅ | Tu user id de Telegram (ver `/id`) |
| `SECRET_KEY` | – | Clave de cifrado de las API keys guardadas |
| `DATA_DIR` | – | Directorio de SQLite y caché (por defecto `./data`) |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL` | – | Modelo por defecto (`anthropic` / `claude-opus-5`) |
| `ANTHROPIC_API_KEY`, etc. | – | Keys por env (nombres según models.dev) |

## 📦 Despliegue

**Docker (recomendado):**

```bash
cp .env.example .env
docker compose up -d --build
```

La base SQLite persiste en `./data`. Ejecuta **una réplica por token** — Telegram rechaza el polling concurrente (409).

**systemd / PM2:** el unit completo está en el [README principal](../../README.md#-deployment). Resumen: `pm2 start "npx tsx src/main.ts" --name sotong --kill-timeout 10000`.

## 🔐 Seguridad

- Las API keys se **cifran en reposo** (AES-256-GCM); solo el dueño puede configurarlas, solo por privado, y el mensaje con la key se borra al momento.
- Todo texto de usuario se escapa antes de renderizar; el prompt del sistema ordena al modelo tratar el texto de los usuarios como contenido, nunca como instrucciones.
- Los comandos de moderación verifican el estado de admin, no actúan contra admins ni contra el bot, y entienden admins anónimos, personas-canal y reenvíos del canal vinculado.
- «Leer todos los mensajes» (para `/summarize`) es **opt-in explícito** por grupo, desactivado por defecto.
- Límites de frecuencia en todas las rutas hacia la IA.

## 🏗 Arquitectura e investigación

Estructura del código, decisiones y roadmap: [README principal](../../README.md#-architecture).
Investigación completa de la plataforma: [`docs/riset-telegram.md`](../riset-telegram.md).

## 📄 Licencia

MIT
