import type { Api } from "grammy";
import { takeDueJobs } from "../db/index.js";

/**
 * Pelaksana job terjadwal sederhana yang tahan restart (job tersimpan di SQLite).
 * Untuk skala besar, ganti dengan pg-boss/BullMQ — antarmukanya sudah setara.
 */
export function startJobRunner(api: Api): () => void {
  const timer = setInterval(async () => {
    for (const job of takeDueJobs()) {
      const payload = JSON.parse(job.payload) as Record<string, number>;
      try {
        if (job.kind === "delete_message") {
          await api.deleteMessage(payload.chatId!, payload.messageId!);
        } else if (job.kind === "kick_unverified") {
          // masih ter-restrict = belum lolos captcha → keluarkan (boleh join lagi)
          const member = await api.getChatMember(payload.chatId!, payload.userId!);
          if (member.status === "restricted" && !member.can_send_messages) {
            await api.banChatMember(payload.chatId!, payload.userId!);
            await api.unbanChatMember(payload.chatId!, payload.userId!, { only_if_banned: true });
          }
          await api.deleteMessage(payload.chatId!, payload.messageId!).catch(() => undefined);
        }
      } catch {
        /* pesan sudah hilang / hak kurang — job dibuang */
      }
    }
  }, 15_000);
  return () => clearInterval(timer);
}
