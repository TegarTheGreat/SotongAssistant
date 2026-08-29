import {
  addWarn, getWarns, clearWarns, getSettings, updateSettings, scheduleJob, claimDueJobs, completeJob,
  saveNote, getNote, listNotes, setProviderKey, getProviderKey, saveMemory, getMemory, migrateChatId,
} from "../src/db/repo.js";
import { addKarma, topKarma, listJobsByKind, deleteJob } from "../src/db/repo.js";
import { t, LOCALES } from "../src/i18n/index.js";
import { encryptSecret, decryptSecret } from "../src/services/security.js";
import { chunkText, parseDuration, markdownToTelegramHtml } from "../src/util/format.js";

// settings
updateSettings(-100123, { captcha: true, warnLimit: 2, language: "id" });
const s = getSettings(-100123);
if (!s.captcha || s.warnLimit !== 2 || s.language !== "id") throw new Error("settings");

// warns atomic
if (addWarn(-100123, 42) !== 1 || addWarn(-100123, 42) !== 2 || getWarns(-100123, 42) !== 2) throw new Error("warns");
clearWarns(-100123, 42);

// jobs at-least-once
scheduleJob("delete_message", { chatId: 1, messageId: 2 }, -5);
const jobs = claimDueJobs();
if (jobs.length !== 1) throw new Error("jobs claim");
if (claimDueJobs().length !== 0) throw new Error("jobs re-claim too early"); // due_at pushed forward
completeJob(jobs[0]!.id);

// notes
saveNote(-100123, "faq", "Read the pinned message");
if (getNote(-100123, "faq") !== "Read the pinned message" || listNotes(-100123).length !== 1) throw new Error("notes");

// provider key encryption round-trip (stored encrypted, read decrypted)
setProviderKey("anthropic", "sk-ant-test-123");
if (getProviderKey("anthropic") !== "sk-ant-test-123") throw new Error("key roundtrip");
const enc = encryptSecret("hello");
if (enc === "hello" || decryptSecret(enc) !== "hello") throw new Error("crypto");

// memory + migration
saveMemory("-100123", [{ role: "user", text: "hi" }], "summary here");
migrateChatId(-100123, -100999);
if (getSettings(-100999).warnLimit !== 2) throw new Error("migration");

// i18n: every locale resolves every key (fallback covers gaps) + interpolation
for (const lang of Object.keys(LOCALES)) {
  const msg = t(lang, "mod.warned", { name: "X", count: 1, limit: 3 });
  if (!msg.includes("X") || msg.includes("{name}")) throw new Error(`i18n ${lang}`);
}
if (t("id", "language.saved", { lang: "Bahasa" }) !== "✅ Bahasa diset ke Bahasa.") throw new Error("i18n id");

// format utils
if (chunkText("a".repeat(9000)).length < 3) throw new Error("chunk");
if (parseDuration("10s") !== 35 || parseDuration("2h") !== 7200) throw new Error("duration clamp");
if (!markdownToTelegramHtml("**hi** `x` <b>").includes("&lt;b&gt;")) throw new Error("escape");

// karma atomic
if (addKarma(-100999, 7, "Alice", 1) !== 1 || addKarma(-100999, 7, "Alice", 2) !== 3) throw new Error("karma");
if (topKarma(-100999)[0]?.score !== 3) throw new Error("karma top");

// recurring job bookkeeping
scheduleJob("announcement", { chatId: -100999, text: "hi", repeatSeconds: 3600 }, 3600);
if (listJobsByKind("announcement").length !== 1) throw new Error("announce list");
if (!deleteJob(listJobsByKind("announcement")[0]!.id)) throw new Error("announce delete");

console.log("ALL SMOKE TESTS OK");
