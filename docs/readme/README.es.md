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
| 🪄 | **IA que ACTÚA** | Los admins solo **lo piden en lenguaje natural** — «mutéalo 2h», «activa el captcha», «encuesta: ¿almuerzo?», «modo nocturno 23:00-06:00» — y el bot lo ejecuta: 30+ acciones en lista blanca, cada una reverificada en el servidor (solo admins, objetivos protegidos, máx. 3 por mensaje) con recibo · más `/imagine`, `/approve`, `/aiquota` y botones URL en la bienvenida |
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
| 🧹 | **Higiene de mensajes** | **Filtros de palabras clave** (`/filter`), **lista de palabras bloqueadas** (`/block`) con borrado inmediato, borrado de enlaces de invitación · panel de moderación de un toque `/mp` (efímero) |
| 🤝 | **Federaciones** | **Listas de baneo entre grupos**: `/newfed` → `/joinfed` en cada grupo · `/fban` banea en todos a la vez y expulsa automáticamente al entrar |
| 🌍 | **Traducción** | `/tr` (respuesta) traduce un mensaje · `/bridge de` traduce automáticamente los mensajes extranjeros en grupos multilingües |
| 📊 | **Estadísticas y básicos** | `/stats` con gráfico de actividad y más activos · `/recall` busca mensajes · `/afk` · `/ping` `/uptime` `/about` `/admins` `/invite` |
| 🔎 | **Inline y más** | `@botname pregunta` consulta a la IA **desde cualquier chat** · la IA **se conoce a sí misma** (versión, comandos, ajustes del chat) · **autoactualización** (`/update`, `AUTO_UPDATE=true`) · `/subscription` suscripciones Stars para canales |
| 🌙 | **Modo nocturno y zona** | `/night 23:00-06:00` bloquea el grupo a diario en hora local del chat (`/settz America/Mexico_City`), con avisos y restauración exacta de permisos |
| 🔞 | **Filtro NSFW** | Revisión de IA opcional de fotos y miniaturas de stickers/vídeos con el modelo multimodal del chat — lo NSFW se borra y alimenta la escalada de avisos; fail-open |
| 👑 | **Herramientas de admin** | `/promote` `/demote` `/title` · `/warnmode` (mute/kick/ban) · “@admin” llama a los admins · `/tagall` · `/disable` desactiva comandos · `/antilink off\|invites\|all` + `/allowlink` · temas del foro (`/newtopic` etc.) · welcome y goodbye con marcadores `{mention}` `{count}` |
| 🧰 | **Todo incluido, totalmente inline** | `/lock` — 12 tipos de medios · `/schedule` — mensajes programados en hora local · las notas de voz en MD se transcriben (Whisper) y se responden, `/transcribe` en grupos · `/unote` — expediente en `/info` · `/fexport`/`/fimport` + admins de federación · `/import` — restaurar respaldos · `/paidpost` — contenido de pago con Stars · panel `/settings` totalmente con botones (incluido el submenú de bloqueos) |
| 🧰 | **Ronda completa de capacidades** | `/aitask` publica con IA según horario (texto siempre nuevo) · `/kang` clona stickers a tu propio pack · avisos de videochat con recordatorio · `/gifts` `/gift` `/balance` economía de Stars · `/tag` etiquetas de miembro · `/unpin` `/unpinall` `/revokeinvite` `/boosts` · identidad del bot desde Telegram (`/setbotname`…) · `/recall` ahora híbrido (léxico + semántico) · acciones de IA del dueño por MD |
| 💼 | **Auto-triaje de Business** | Cada chat de cliente recibe respuesta de IA **más una etiqueta automática** (intención, urgencia, resumen de una línea) sin llamadas extra · `/leads [etiqueta]` es la bandeja priorizada en el MD del dueño · las acciones del dueño ya configuran cualquier grupo en remoto y muestran qué proveedores tienen clave (solo nombres) |
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
