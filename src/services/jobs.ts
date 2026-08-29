import type { Api } from "grammy";
import { config } from "../config.js";
import { claimDueJobs, completeJob, scheduleJob, getSettings, updateSettings, recentMessages } from "../db/repo.js";
import { UNMUTED_PERMISSIONS } from "../util/permissions.js";
import { escapeHtml, markdownToTelegramHtml } from "../util/format.js";
import { t } from "../i18n/index.js";
import { getCatalog } from "./catalog.js";
import { streamCompletion } from "./ai/index.js";

/**
 * Durable job runner (jobs live in SQLite, so they survive restarts).
 * Semantics are at-least-once: a job is deleted only after it executed;
 * a crash mid-run re-delivers it (claim pushes due_at forward 60s), and
 * jobs past the attempt limit are dropped on claim.
 *
 * Kinds: delete_message · kick_unverified · reminder · raid_unlock ·
 * announcement (self-rescheduling when payload.repeatSeconds is set).
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

          case "raid_unlock": {
            // Restore the permission snapshot taken when raid mode engaged.
            const chatId = payload.chatId as number;
            const snapshot = getSettings(chatId).lockSnapshot ?? UNMUTED_PERMISSIONS;
            await api.setChatPermissions(chatId, snapshot);
            updateSettings(chatId, { lockSnapshot: undefined });
            const lang = getSettings(chatId).language ?? "en";
            await api.sendMessage(chatId, t(lang, "raid.off")).catch(() => undefined);
            break;
          }

          case "digest": {
            // Recurring AI summary of the group's recent activity.
            const chatId = payload.chatId as number;
            const repeat = payload.repeatSeconds as number | undefined;
            const settings = getSettings(chatId);
            const log = recentMessages(chatId, 150);
            if (settings.ai && settings.ambient && log.length >= 10) {
              const catalog = await getCatalog();
              const provider = catalog[settings.aiProvider ?? config.defaultProvider];
              if (provider) {
                const transcript = log.map((m) => `${m.name ?? "?"}: ${m.text}`).join("\n").slice(-12_000);
                const summary = await streamCompletion(
                  {
                    provider,
                    model: settings.aiModel ?? config.defaultModel,
                    system:
                      "Write a short periodic digest of this group-chat excerpt: main topics, decisions, " +
                      "open questions, notable moments. Bullet points, dominant language of the conversation.",
                    history: [],
                    userText: transcript,
                    maxTokens: 1024,
                  },
                  () => undefined,
                );
                await api.sendMessage(chatId, `🗞 ${markdownToTelegramHtml(summary).slice(0, 4000)}`, {
                  parse_mode: "HTML",
                });
              }
            }
            // Keep the schedule alive even when a run is skipped (toggles resume later).
            if (repeat && repeat >= 3600) scheduleJob("digest", payload, repeat);
            break;
          }

          case "announcement": {
            const chatId = payload.chatId as number;
            await api.sendMessage(chatId, `📣 ${escapeHtml(payload.text as string)}`, {
              parse_mode: "HTML",
            });
            const repeat = payload.repeatSeconds as number | undefined;
            if (repeat && repeat >= 60) scheduleJob("announcement", payload, repeat);
            break;
          }
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
