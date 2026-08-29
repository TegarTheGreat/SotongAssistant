<div align="center">

# 🦑 SotongAssistant

**O assistente completo para o Telegram — moderação, boas-vindas inteligentes,
canais, Telegram Business e IA com qualquer modelo do [models.dev](https://models.dev).
Toda a configuração vive dentro do Telegram. Sem painel web.**

🌐 [English](../../README.md) · [Bahasa Indonesia](README.id.md) · [Русский](README.ru.md) · [Español](README.es.md) · [हिन्दी](README.hi.md) · [العربية](README.ar.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Українська](README.uk.md)

</div>

---

## ✨ Recursos

| | Capacidade | Detalhes |
|---|---|---|
| 🪄 | **IA que AGE** | Os admins apenas **pedem em linguagem natural** — “muta ele 2h”, “liga o captcha”, “enquete: almoço?”, “modo noturno 23:00-06:00” — e o bot executa: 30+ ações em lista branca, cada uma re-verificada no servidor (só admins, alvos protegidos, máx. 3 por mensagem) com recibo · mais `/imagine`, `/approve`, `/aiquota` e botões URL na saudação |
| 🤖 | **Assistente de IA** | `/ask`, responder ao bot ou @menção · escolha **qualquer provedor e modelo do models.dev** por menus inline · respostas em streaming · personalidade por chat (`/aiprompt`) · `/summarize` para resumos do grupo |
| 🧠 | **Memória em camadas** | Transcrição de curto prazo **mais** um resumo de longo prazo mantido pelo próprio modelo (estilo OpenClaw/Hermes) · por grupo *e* por tópico · `/memory`, `/forget` |
| 🛡 | **Moderação** | `/warn` com escalada automática · `/mute 2h` (aplicado pelos servidores do Telegram — sobrevive a reinícios) · `/ban` + limpeza total · `/unban` seguro · `/purge` · `/lockdown` e `/unlock` · `/info`, `/report` |
| 👋 | **Onboarding** | Detecção confiável de entrada via `chat_member` · boas-vindas (autolimpeza) · captcha de botão com expulsão por tempo · verificação de pedidos de entrada no privado |
| 🌊 | **Anti-abuso** | Anti-flood com silêncio automático · bloqueio de spam de canais (canal vinculado na lista branca) · entende admins anônimos e reenvios automáticos |
| 📒 | **Notas e regras** | `/save faq` → recupere com `#faq` · `/setrules` e `/rules` |
| 🎲 | **Engajamento** | Dados/dardos/slot · `/poll` e `/quiz` com várias respostas · `/remind 10m …` · `/donate` com Telegram Stars ⭐ |
| 📣 | **Canais** | Registra os canais que administra, `/ping` |
| 💼 | **Telegram Business** | Responde clientes com IA em nome do dono da conta (com limites de frequência e concorrência) |
| 📋 | **Gerente do bot** | `/status`: todos os chats + permissões do bot em cada um · migração para supergrupo automática |
| 🧹 | **Higiene de mensagens** | **Filtros de palavras-chave** (`/filter`), **lista de palavras bloqueadas** (`/block`) com exclusão imediata, exclusão de links de convite · painel de moderação de um toque `/mp` (efêmero) |
| 🤝 | **Federações** | **Listas de ban entre grupos**: `/newfed` → `/joinfed` em cada grupo · `/fban` bane em todos de uma vez e remove automaticamente ao entrar |
| 🌍 | **Tradução** | `/tr` (resposta) traduz uma mensagem · `/bridge de` traduz automaticamente mensagens estrangeiras em grupos multilíngues |
| 📊 | **Estatísticas e básicos** | `/stats` com gráfico de atividade e mais ativos · `/recall` busca mensagens · `/afk` · `/ping` `/uptime` `/about` `/admins` `/invite` |
| 🔎 | **Inline e mais** | `@botname pergunta` consulta a IA **de qualquer chat** · a IA **conhece a si mesma** (versão, comandos, configurações do chat) · **autoatualização** (`/update`, `AUTO_UPDATE=true`) · `/subscription` assinaturas Stars para canais |
| 🌙 | **Modo noturno e fuso** | `/night 23:00-06:00` tranca o grupo diariamente na hora local do chat (`/settz America/Sao_Paulo`), com avisos e restauração exata das permissões |
| 🔞 | **Filtro NSFW** | Triagem de IA opcional de fotos e miniaturas de figurinhas/vídeos com o modelo multimodal do chat — NSFW é apagado e alimenta a escalada de avisos; fail-open |
| 👑 | **Ferramentas de admin** | `/promote` `/demote` `/title` · `/warnmode` (mute/kick/ban) · “@admin” chama os admins · `/tagall` · `/disable` desativa comandos · `/antilink off\|invites\|all` + `/allowlink` · tópicos do fórum (`/newtopic` etc.) · welcome e goodbye com marcadores `{mention}` `{count}` |
| 🧰 | **Tudo incluído, totalmente inline** | `/lock` — 12 tipos de mídia · `/schedule` — mensagens agendadas na hora local · notas de voz no PV são transcritas (Whisper) e respondidas, `/transcribe` em grupos · `/unote` — dossiê em `/info` · `/fexport`/`/fimport` + admins de federação · `/import` — restaurar backups · `/paidpost` — mídia paga com Stars · painel `/settings` totalmente por botões (incluindo o submenu de bloqueios) |
| 🧰 | **Rodada completa de capacidades** | `/aitask` publica com IA no horário (texto sempre novo) · `/kang` clona figurinhas para o seu pacote · avisos de bate-papo por vídeo com lembrete · `/gifts` `/gift` `/balance` economia de Stars · `/tag` etiquetas de membro · `/unpin` `/unpinall` `/revokeinvite` `/boosts` · identidade do bot pelo Telegram (`/setbotname`…) · `/recall` agora híbrido (léxico + semântico) · ações de IA do dono no PV |
| 🌐 | **10 idiomas** | Autodetecção pelo Telegram do usuário, substituível por chat com `/lang` |

**Tudo é configurado dentro do Telegram**: `/settings` abre um menu inline por
grupo (boas-vindas, captcha, IA, respostas efêmeras, anti-flood, contexto,
limite de avisos, idioma). As API keys são definidas no privado — nunca em
arquivo, nunca em grupo.

## 🚀 Início rápido

> **Requisitos:** Node.js ≥ 20 e um token do [@BotFather](https://t.me/BotFather).

```bash
git clone https://github.com/TegarTheGreat/SotongAssistant.git
cd SotongAssistant
cp .env.example .env        # preencha BOT_TOKEN e OWNER_ID
npm install
npm run dev                 # ou: npm start
```

Depois, no Telegram:

1. **Chame o bot no privado** → `/setkey anthropic sk-ant-…` (somente o dono; a mensagem é apagada na hora e a key é salva criptografada).
2. **Adicione o bot a um grupo** e torne-o **admin** (apagar mensagens, restringir, convidar, fixar). Sem admin ele não vê todas as mensagens (privacy mode).
3. No grupo: `/settings` para tudo, `/aimodel` para escolher o modelo de IA.
4. *(Opcional)* **Business**: conecte em *Configurações → Telegram Business → Chatbots*.

### Configuração

| Variável | Obrig. | Significado |
|---|---|---|
| `BOT_TOKEN` | ✅ | Token do @BotFather |
| `OWNER_ID` | ✅ | Seu user id do Telegram (veja `/id`) |
| `SECRET_KEY` | – | Chave de criptografia das API keys salvas |
| `DATA_DIR` | – | Diretório do SQLite e cache (padrão `./data`) |
| `DEFAULT_AI_PROVIDER` / `DEFAULT_AI_MODEL` | – | Modelo padrão (`anthropic` / `claude-opus-5`) |
| `ANTHROPIC_API_KEY`, etc. | – | Keys via env (nomes conforme models.dev) |

## 📦 Deploy

**Docker (recomendado):**

```bash
cp .env.example .env
docker compose up -d --build
```

O banco SQLite persiste em `./data`. Rode **uma réplica por token** — o Telegram rejeita polling concorrente (409).

**systemd / PM2:** o unit completo está no [README principal](../../README.md#-deployment). Resumo: `pm2 start "npx tsx src/main.ts" --name sotong --kill-timeout 10000`.

## 🔐 Segurança

- API keys **criptografadas em repouso** (AES-256-GCM); só o dono define, só no privado, e a mensagem com a key é apagada imediatamente.
- Todo texto de usuário é escapado antes de renderizar; o prompt de sistema manda o modelo tratar texto de usuários como conteúdo, nunca instruções.
- Comandos de moderação verificam status de admin, não atingem admins nem o bot, e entendem admins anônimos, personas de canal e reenvios do canal vinculado.
- “Ler todas as mensagens” (para `/summarize`) é **opt-in explícito** por grupo, desligado por padrão.
- Limites de frequência em todas as rotas de IA.

## 🏗 Arquitetura e pesquisa

Estrutura do código, decisões e roadmap: [README principal](../../README.md#-architecture).
Pesquisa completa da plataforma: [`docs/riset-telegram.md`](../riset-telegram.md).

## 📄 Licença

MIT
