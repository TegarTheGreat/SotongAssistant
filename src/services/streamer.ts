import type { Api } from "grammy";
import { markdownToTelegramHtml, chunkText } from "../util/format.js";

/**
 * Pseudo-streaming untuk grup: kirim placeholder lalu edit ber-throttle.
 * Budget resmi ±20 pesan+edit/menit per grup → interval edit 4 detik.
 * (Streaming draft native Telegram masih private-chat-only per Bot API 10.3.)
 */
export class TelegramStreamer {
  private lastEdit = 0;
  private lastText = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: string | undefined;
  private messageId: number | undefined;
  private readonly intervalMs: number;

  constructor(
    private api: Api,
    private chatId: number,
    private threadId?: number,
    isPrivate = false,
  ) {
    this.intervalMs = isPrivate ? 1500 : 4000;
  }

  async start(): Promise<void> {
    const msg = await this.api.sendMessage(this.chatId, "…", {
      message_thread_id: this.threadId,
    });
    this.messageId = msg.message_id;
  }

  /** Terima teks penuh terkini; edit dilakukan ber-throttle. */
  update(fullText: string): void {
    this.pending = fullText;
    if (this.timer) return;
    const wait = Math.max(0, this.lastEdit + this.intervalMs - Date.now());
    this.timer = setTimeout(() => void this.flush(false), wait);
  }

  private async flush(final: boolean): Promise<void> {
    this.timer = undefined;
    if (this.messageId === undefined || this.pending === undefined) return;
    // saat streaming: kirim plain text terpotong; format HTML hanya di edit final
    const preview = this.pending.length > 3900 ? this.pending.slice(0, 3900) + "…" : this.pending;
    if (!final && preview === this.lastText) return;
    this.lastText = preview;
    this.lastEdit = Date.now();
    try {
      await this.api.editMessageText(this.chatId, this.messageId, preview);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("retry after")) {
        // 429 — perpanjang jeda, jangan retry agresif
        this.lastEdit = Date.now() + 10_000;
      } else if (!msg.includes("message is not modified")) {
        console.warn("editMessageText gagal:", msg);
      }
    }
  }

  /** Edit final: render HTML, pecah bila > 4096, fallback plain bila parse gagal. */
  async finish(fullText: string): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.messageId === undefined) return;
    const chunks = chunkText(fullText.trim() || "—");
    const first = chunks[0]!;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, markdownToTelegramHtml(first), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await this.api
        .editMessageText(this.chatId, this.messageId, first)
        .catch(() => undefined);
    }
    for (const extra of chunks.slice(1)) {
      try {
        await this.api.sendMessage(this.chatId, markdownToTelegramHtml(extra), {
          parse_mode: "HTML",
          message_thread_id: this.threadId,
          link_preview_options: { is_disabled: true },
        });
      } catch {
        await this.api.sendMessage(this.chatId, extra, { message_thread_id: this.threadId });
      }
      // patuh budget per grup
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  async fail(reason: string): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.messageId === undefined) return;
    await this.api
      .editMessageText(this.chatId, this.messageId, `⚠️ ${reason}`)
      .catch(() => undefined);
  }
}
