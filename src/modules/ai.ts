import { Composer, InlineKeyboard, type Context } from "grammy";
import { config } from "../config.js";
import {
  getMemory,
  saveMemory,
  clearMemory,
  getSettings,
  updateSettings,
  setProviderKey,
} from "../db/index.js";
import { getCatalog, sortProviders } from "../services/catalog.js";
import { streamCompletion, resolveApiKey } from "../services/ai/index.js";
import { TelegramStreamer } from "../services/streamer.js";
import { escapeHtml } from "../util/format.js";
import { senderIsAdmin } from "../util/admin.js";

export const ai = new Composer<Context>();

const activeGenerations = new Set<string>(); // "chatId" — cap 1 generasi per chat
const userLastAsk = new Map<string, number>(); // rate limit ringan per user

function memoryKey(ctx: Context): string {
  const thread = ctx.message?.message_thread_id;
  return thread ? `${ctx.chat!.id}:${thread}` : String(ctx.chat!.id);
}

function defaultSystemPrompt(ctx: Context): string {
  const chat = ctx.chat;
  const place =
    chat?.type === "private"
      ? "sebuah percakapan pribadi"
      : `grup Telegram "${chat && "title" in chat ? chat.title : ""}"`;
  return (
    `Kamu adalah SotongAssistant, asisten Telegram yang membantu di ${place}. ` +
    `Jawab ringkas dan langsung; pesan Telegram dibatasi 4096 karakter. ` +
    `Kamu hanya melihat pesan yang ditujukan padamu, bukan seluruh obrolan. ` +
    `Gunakan bahasa yang dipakai penanya.`
  );
}

async function runAsk(ctx: Context, question: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const settings = getSettings(chatId);
  if (!settings.ai) {
    await ctx.reply("Fitur AI dimatikan di chat ini. Admin bisa mengaktifkan lewat /settings.");
    return;
  }

  // rate limit: 3 pertanyaan/menit per user, 1 generasi bersamaan per chat
  const userKey = `${chatId}:${ctx.from?.id ?? 0}`;
  const last = userLastAsk.get(userKey) ?? 0;
  if (Date.now() - last < 20_000) {
    await ctx.react("🥱").catch(() => undefined);
    return;
  }
  if (activeGenerations.has(String(chatId))) {
    await ctx.react("🤔").catch(() => undefined);
    return;
  }
  userLastAsk.set(userKey, Date.now());
  activeGenerations.add(String(chatId));

  const catalog = await getCatalog();
  const providerId = settings.aiProvider ?? config.defaultProvider;
  const modelId = settings.aiModel ?? config.defaultModel;
  const provider = catalog[providerId];

  const streamer = new TelegramStreamer(
    ctx.api,
    chatId,
    ctx.message?.message_thread_id,
    ctx.chat!.type === "private",
  );

  try {
    if (!provider) throw new Error(`Provider "${providerId}" tidak ada di katalog models.dev.`);
    await ctx.api.sendChatAction(chatId, "typing", {
      message_thread_id: ctx.message?.message_thread_id,
    });
    await streamer.start();

    const memKey = memoryKey(ctx);
    const history = getMemory(memKey);
    const full = await streamCompletion(
      {
        provider,
        model: modelId,
        system: settings.aiSystemPrompt ?? defaultSystemPrompt(ctx),
        history,
        userText: question,
        userName: ctx.from?.first_name,
      },
      (text) => streamer.update(text),
    );
    await streamer.finish(full);
    saveMemory(memKey, [
      ...history,
      { role: "user", name: ctx.from?.first_name, text: question },
      { role: "assistant", text: full },
    ]);
  } catch (err) {
    await streamer.fail((err as Error).message);
  } finally {
    activeGenerations.delete(String(chatId));
  }
}

// ---------- pemicu ----------

ai.command("ask", async (ctx) => {
  const q = ctx.match.trim();
  if (!q) {
    await ctx.reply("Pakai: /ask <pertanyaan>");
    return;
  }
  await runAsk(ctx, q);
});

ai.command("forget", async (ctx) => {
  clearMemory(memoryKey(ctx));
  await ctx.reply("🧠 Memori percakapan chat ini dihapus.");
});

// reply ke pesan bot, atau @mention bot di grup (mention butuh bot admin/privacy off)
ai.on("message:text", async (ctx, next) => {
  const text = ctx.message.text;
  const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
  const mention = `@${ctx.me.username}`;
  const isMention = text.includes(mention);
  const isPrivate = ctx.chat.type === "private";

  if (isReplyToBot || isMention || isPrivate) {
    const q = text.replaceAll(mention, "").trim();
    if (q && !q.startsWith("/")) {
      await runAsk(ctx, q);
      return;
    }
  }
  await next();
});

// ---------- konfigurasi AI via Telegram ----------

const PAGE = 8;

function providerKeyboard(providers: { id: string; name?: string }[], page: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  const slice = providers.slice(page * PAGE, (page + 1) * PAGE);
  for (const p of slice) kb.text(p.name ?? p.id, `aiprov:${p.id}`).row();
  const nav = new InlineKeyboard();
  if (page > 0) nav.text("« Sebelumnya", `aipage:${page - 1}`);
  if ((page + 1) * PAGE < providers.length) nav.text("Berikutnya »", `aipage:${page + 1}`);
  kb.append(nav);
  return kb;
}

ai.command("aimodel", async (ctx) => {
  if (ctx.chat.type !== "private" && !(await senderIsAdmin(ctx))) {
    await ctx.reply("Hanya admin yang boleh mengganti model AI chat ini.");
    return;
  }
  const catalog = await getCatalog();
  const providers = sortProviders(catalog);
  const s = getSettings(ctx.chat.id);
  await ctx.reply(
    `🤖 <b>Model AI chat ini</b>\nProvider: <code>${escapeHtml(s.aiProvider ?? config.defaultProvider)}</code>\n` +
      `Model: <code>${escapeHtml(s.aiModel ?? config.defaultModel)}</code>\n\nPilih provider (data: models.dev):`,
    { parse_mode: "HTML", reply_markup: providerKeyboard(providers, 0) },
  );
});

ai.callbackQuery(/^aipage:(\d+)$/, async (ctx) => {
  const page = Number(ctx.match[1]);
  const providers = sortProviders(await getCatalog());
  await ctx.editMessageReplyMarkup({ reply_markup: providerKeyboard(providers, page) });
  await ctx.answerCallbackQuery();
});

ai.callbackQuery(/^aiprov:(.+)$/, async (ctx) => {
  const providerId = ctx.match[1]!;
  const catalog = await getCatalog();
  const provider = catalog[providerId];
  if (!provider) {
    await ctx.answerCallbackQuery({ text: "Provider tidak ditemukan", show_alert: true });
    return;
  }
  const models = Object.values(provider.models).slice(0, 30);
  const kb = new InlineKeyboard();
  for (const m of models) kb.text(m.name ?? m.id, `aimodel:${providerId}:${m.id}`.slice(0, 64)).row();
  const hasKey = Boolean(resolveApiKey(provider));
  await ctx.editMessageText(
    `Provider <b>${escapeHtml(provider.name ?? providerId)}</b> — ` +
      (hasKey ? "✅ API key tersedia" : `⚠️ belum ada API key (owner: /setkey ${providerId} … via DM)`) +
      `\nPilih model:`,
    { parse_mode: "HTML", reply_markup: kb },
  );
  await ctx.answerCallbackQuery();
});

ai.callbackQuery(/^aimodel:([^:]+):(.+)$/, async (ctx) => {
  if (ctx.chat?.type !== "private" && ctx.from && !(await senderIsAdmin(ctx))) {
    await ctx.answerCallbackQuery({ text: "Hanya admin.", show_alert: true });
    return;
  }
  const providerId = ctx.match[1]!;
  const modelId = ctx.match[2]!;
  updateSettings(ctx.chat!.id, { aiProvider: providerId, aiModel: modelId });
  await ctx.editMessageText(
    `✅ Model AI chat ini: <code>${escapeHtml(providerId)}/${escapeHtml(modelId)}</code>`,
    { parse_mode: "HTML" },
  );
  await ctx.answerCallbackQuery({ text: "Model disimpan" });
});

ai.command("aiprompt", async (ctx) => {
  if (ctx.chat.type !== "private" && !(await senderIsAdmin(ctx))) return;
  const prompt = ctx.match.trim();
  if (!prompt) {
    updateSettings(ctx.chat.id, { aiSystemPrompt: undefined });
    await ctx.reply("System prompt dikembalikan ke default.");
    return;
  }
  updateSettings(ctx.chat.id, { aiSystemPrompt: prompt });
  await ctx.reply("✅ System prompt chat ini disimpan.");
});

// /setkey <provider> <key> — hanya owner, hanya via DM (jangan pernah tempel key di grup!)
ai.command("setkey", async (ctx) => {
  if (ctx.chat.type !== "private") {
    await ctx.deleteMessage().catch(() => undefined);
    await ctx.reply("⚠️ Demi keamanan, kirim /setkey lewat DM ke bot, jangan di grup.");
    return;
  }
  if (ctx.from?.id !== config.ownerId) {
    await ctx.reply("Hanya owner bot yang boleh menyetel API key.");
    return;
  }
  const [provider, key] = ctx.match.trim().split(/\s+/, 2);
  if (!provider || !key) {
    await ctx.reply("Pakai: /setkey <provider-id> <api-key>\nContoh: /setkey anthropic sk-ant-…");
    return;
  }
  setProviderKey(provider, key);
  await ctx.reply(`✅ API key untuk <code>${escapeHtml(provider)}</code> disimpan.`, {
    parse_mode: "HTML",
  });
});
