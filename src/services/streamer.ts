import type { Api } from "grammy";
import { markdownToTelegramHtml, chunkText } from "../util/format.js";

/**
 * Pseudo-streaming for group chats: send a placeholder, then edit on a throttle.
 * The official budget is ~20 messages+edits per minute per group, hence the 4s
 * interval. (Telegram's native draft streaming is still private-chat-only.)
 *
 * Concurrency: finish() waits for any in-flight throttled edit and then sets a
 * `finished` flag, so a stale preview can never overwrite the final answer.
 */
export class TelegramStreamer {
  private lastEdit = 0;
  private lastText = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: string | undefined;
  private messageId: number | undefined;
  private inflight: Promise<void> | undefined;
  private finished = false;
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

  /** Receive the latest accumulated text; edits are throttled. */
  update(fullText: string): void {
    if (this.finished) return;
    this.pending = fullText;
    if (this.timer) return;
    const wait = Math.max(0, this.lastEdit + this.intervalMs - Date.now());
    this.timer = setTimeout(() => {
      this.inflight = this.flush().finally(() => (this.inflight = undefined));
    }, wait);
  }

  private async flush(): Promise<void> {
    this.timer = undefined;
    if (this.finished || this.messageId === undefined || this.pending === undefined) return;
    // While streaming, send truncated plain text; HTML formatting happens only in the final edit.
    const preview = this.pending.length > 3900 ? this.pending.slice(0, 3900) + "…" : this.pending;
    if (preview === this.lastText) return;
    this.lastText = preview;
    this.lastEdit = Date.now();
    try {
      await this.api.editMessageText(this.chatId, this.messageId, preview);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("retry after")) {
        // 429 — back off; never retry aggressively.
        this.lastEdit = Date.now() + 10_000;
      } else if (!msg.includes("message is not modified")) {
        console.warn("editMessageText failed:", msg);
      }
    }
  }

  /** Final edit: render HTML, split if > 4096, plain-text fallback if parsing fails. */
  async finish(fullText: string): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.inflight) await this.inflight.catch(() => undefined);
    this.finished = true;
    if (this.messageId === undefined) return;

    const chunks = chunkText(fullText.trim() || "—");
    const first = chunks[0]!;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, markdownToTelegramHtml(first), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await this.api.editMessageText(this.chatId, this.messageId, first).catch(() => undefined);
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
      // Stay inside the per-group send budget.
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  async fail(reason: string): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.inflight) await this.inflight.catch(() => undefined);
    this.finished = true;
    if (this.messageId === undefined) return;
    await this.api.editMessageText(this.chatId, this.messageId, `⚠️ ${reason}`).catch(() => undefined);
  }
}
