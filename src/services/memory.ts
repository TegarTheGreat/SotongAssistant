import { getMemory, saveMemory, type MemoryMessage } from "../db/repo.js";
import { streamCompletion } from "./ai/index.js";
import type { CatalogProvider } from "./catalog.js";

/**
 * Layered conversation memory, in the spirit of agent frameworks like
 * OpenClaw/Hermes:
 *
 *  - short-term: a rolling transcript of recent exchanges (kept verbatim)
 *  - long-term:  a distilled summary the model itself maintains — when the
 *    transcript outgrows the window, the oldest half is folded into the
 *    summary and dropped, so context survives far beyond the raw window.
 *
 * The summary is injected into the system prompt on every request.
 */

const TRANSCRIPT_CAP = 24;
const FOLD_COUNT = 12;

const compacting = new Set<string>();

export function appendExchange(
  chatKey: string,
  userName: string | undefined,
  question: string,
  answer: string,
): void {
  const mem = getMemory(chatKey);
  const messages: MemoryMessage[] = [
    ...mem.messages,
    { role: "user", name: userName, text: question.slice(0, 2000) },
    { role: "assistant", text: answer.slice(0, 2000) },
  ];
  saveMemory(chatKey, messages);
}

/**
 * Fold the oldest transcript entries into the long-term summary when the
 * window overflows. Runs in the background (fire-and-forget) and is guarded
 * against concurrent compactions for the same chat.
 */
export function compactIfNeeded(chatKey: string, provider: CatalogProvider, model: string): void {
  const mem = getMemory(chatKey);
  if (mem.messages.length <= TRANSCRIPT_CAP || compacting.has(chatKey)) return;
  compacting.add(chatKey);

  const toFold = mem.messages.slice(0, FOLD_COUNT);
  const rest = mem.messages.slice(FOLD_COUNT);
  const transcript = toFold
    .map((m) => `${m.role === "user" ? (m.name ?? "User") : "Assistant"}: ${m.text}`)
    .join("\n");

  const system =
    "You maintain the long-term memory of a chat assistant. Merge the existing memory with the new " +
    "conversation excerpt into a single dense memory document (max ~200 words). Keep durable facts: " +
    "names, preferences, decisions, ongoing topics, promises. Drop pleasantries. Answer with the " +
    "memory text only, in the language most used in the conversation.";

  void streamCompletion(
    {
      provider,
      model,
      system,
      history: [],
      userText: `EXISTING MEMORY:\n${mem.summary ?? "(empty)"}\n\nNEW EXCERPT:\n${transcript}`,
      maxTokens: 600,
    },
    () => undefined,
  )
    .then((summary) => saveMemory(chatKey, rest, summary.trim()))
    .catch(() => undefined) // compaction is best-effort; transcript stays intact on failure
    .finally(() => compacting.delete(chatKey));
}
