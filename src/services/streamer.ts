import type { Api } from "grammy";
import { markdownToTelegramHtml, chunkText } from "../util/format.js";

/**
 * Streams an AI answer into Telegram.
 *
 * Private chats: native draft streaming (sendMessageDraft, Bot API 9.3+) —
 * a smooth in-place preview with Telegram's own "stop generating" button;
 * the final text is persisted with a real message. Falls back automatically
 * where drafts are unavailable.
 *
 * Groups: pseudo-streaming — placeholder + throttled edits. The official
 * budget is ~20 messages+edits/minute per group, hence the 4s interval.
 *
 * Concurrency: finish() waits for any in-flight edit and then sets a
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
  private draftMode: boolean;
  private readonly draftId = Math.floor(Math.random() * 2_000_000_000) + 1;
  private readonly intervalMs: number;

  constructor(
    private api: Api,
    private chatId: number,
    private threadId?: number,
    isPrivate = false,
  ) {
    this.draftMode = isPrivate;
    this.intervalMs = isPrivate ? 1000 : 4000;
  }

  private get raw(): Record<string, (p: unknown) => Promise<unknown>> {
    // grammY's raw API is a proxy: any method name is forwarded to the wire.
    return this.api.raw as unknown as Record<string, (p: unknown) => Promise<unknown>>;
  }

  private async sendDraft(text: string): Promise<void> {
    await this.raw.sendMessageDraft!({
      chat_id: this.chatId,
      draft_id: this.draftId,
      text: text.slice(0, 4096),
      can_stop: true,
    });
  }

  async start(): Promise<void> {
    if (this.draftMode) {
      // Empty text renders Telegram's native "Thinking…" placeholder.
      try {
        await this.sendDraft("");
        return;
      } catch {
        this.draftMode = false; // server/client without draft support
      }
    }
    const msg = await this.api.sendMessage(this.chatId, "…", {
      message_thread_id: this.threadId,
    });
    this.messageId = msg.message_id;
  }

  /** Receive the latest accumulated text; updates are throttled. */
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
    if (this.finished || this.pending === undefined) return;
    const preview = this.pending.length > 3900 ? this.pending.slice(0, 3900) + "…" : this.pending;
    if (preview === this.lastText) return;
    this.lastText = preview;
    this.lastEdit = Date.now();

    if (this.draftMode) {
      await this.sendDraft(preview).catch(() => undefined); // drafts are best-effort
      return;
    }
    if (this.messageId === undefined) return;
    try {
      // While streaming, plain text only; HTML formatting happens in the final edit.
      await this.api.editMessageText(this.chatId, this.messageId, preview);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("retry after")) {
        this.lastEdit = Date.now() + 10_000; // 429 — back off, never retry hot
      } else if (!msg.includes("message is not modified")) {
        console.warn("editMessageText failed:", msg);
      }
    }
  }

  /**
   * Try native Rich Messages (Bot API 10.1) for the final answer: the model's
   * raw Markdown renders as real tables/code/lists with no escaping. Only for
   * answers that actually contain Markdown structure; failures fall back.
   */
  private looksRich(text: string): boolean {
    return /```|\*\*|^#{1,3} |\n\|.+\|/m.test(text);
  }

  private async tryRichEdit(text: string): Promise<boolean> {
    if (!this.looksRich(text) || this.messageId === undefined) return false;
    try {
      await this.raw.editMessageText!({
        chat_id: this.chatId,
        message_id: this.messageId,
        rich_message: { markdown: text },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async tryRichSend(text: string): Promise<boolean> {
    if (!this.looksRich(text)) return false;
    try {
      await this.raw.sendRichMessage!({
        chat_id: this.chatId,
        rich_message: { markdown: text },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async sendHtml(text: string): Promise<void> {
    try {
      await this.api.sendMessage(this.chatId, markdownToTelegramHtml(text), {
        parse_mode: "HTML",
        message_thread_id: this.threadId,
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await this.api.sendMessage(this.chatId, text, { message_thread_id: this.threadId });
    }
  }

  /** Final delivery: Rich Message when possible, else HTML; split if > 4096. */
  async finish(fullText: string): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.inflight) await this.inflight.catch(() => undefined);
    this.finished = true;

    const chunks = chunkText(fullText.trim() || "—");
    const first = chunks[0]!;

    if (this.draftMode) {
      // The draft is a temporary preview — persist with real messages.
      if (!(chunks.length === 1 && (await this.tryRichSend(first)))) {
        await this.sendHtml(first);
      }
    } else if (this.messageId !== undefined) {
      if (!(chunks.length === 1 && (await this.tryRichEdit(first)))) {
        try {
          await this.api.editMessageText(this.chatId, this.messageId, markdownToTelegramHtml(first), {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          });
        } catch {
          await this.api.editMessageText(this.chatId, this.messageId, first).catch(() => undefined);
        }
      }
    }

    for (const extra of chunks.slice(1)) {
      await this.sendHtml(extra);
      await new Promise((r) => setTimeout(r, 1200)); // stay inside the send budget
    }
  }

  async fail(reason: string): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    if (this.inflight) await this.inflight.catch(() => undefined);
    this.finished = true;
    if (this.draftMode || this.messageId === undefined) {
      await this.api
        .sendMessage(this.chatId, `⚠️ ${reason}`, { message_thread_id: this.threadId })
        .catch(() => undefined);
      return;
    }
    await this.api.editMessageText(this.chatId, this.messageId, `⚠️ ${reason}`).catch(() => undefined);
  }
}
