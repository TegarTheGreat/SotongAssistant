import type { Api } from "grammy";
import { claimDueJobs, completeJob } from "../db/repo.js";

/**
 * Durable job runner (jobs live in SQLite, so they survive restarts).
 * Semantics are at-least-once: a job is deleted only after it executed;
 * a crash mid-run re-delivers it (claim pushes due_at forward 60s), and
 * jobs past the attempt limit are dropped on claim.
 */
export function startJobRunner(api: Api): () => void {
  const timer = setInterval(async () => {
    for (const job of claimDueJobs()) {
      const payload = JSON.parse(job.payload) as Record<string, unknown>;
      try {
        switch (job.kind) {
          case "delete_message":
            await api
              .deleteMessage(payload.chatId as number, payload.messageId as number)
              .catch(() => undefined); // already gone — that's success for us
            break;
          case "kick_unverified": {
            // Still restricted = captcha never passed → remove (they may rejoin).
            const member = await api.getChatMember(payload.chatId as number, payload.userId as number);
            if (member.status === "restricted" && !member.can_send_messages) {
              await api.banChatMember(payload.chatId as number, payload.userId as number);
              await api.unbanChatMember(payload.chatId as number, payload.userId as number, {
                only_if_banned: true,
              });
            }
            await api
              .deleteMessage(payload.chatId as number, payload.messageId as number)
              .catch(() => undefined);
            break;
          }
          case "reminder":
            await api.sendMessage(payload.chatId as number, payload.text as string, {
              parse_mode: "HTML",
            });
            break;
        }
        completeJob(job.id);
      } catch (err) {
        // Leave the job in the table — the bumped due_at retries it in ~60s,
        // and the attempt cap prevents infinite loops.
        console.warn(`job ${job.kind}#${job.id} failed (attempt ${job.attempts + 1}):`, (err as Error).message);
      }
    }
  }, 15_000);
  return () => clearInterval(timer);
}
