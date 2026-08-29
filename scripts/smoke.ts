import {
  addWarn, getWarns, clearWarns, getSettings, updateSettings, scheduleJob, claimDueJobs, completeJob,
  saveNote, getNote, listNotes, setProviderKey, getProviderKey, saveMemory, getMemory, migrateChatId,
} from "../src/db/repo.js";
import { addKarma, topKarma, listJobsByKind, deleteJob } from "../src/db/repo.js";
import {
  saveFilter, deleteFilter, listFilters, addBlockedWord, removeBlockedWord, listBlockedWords,
  setAfk, getAfk, clearAfk, createFederation, getFederation, joinFederation, leaveFederation,
  fedOfChat, fedChats, addFedBan, getFedBan, removeFedBan, fedBanCount, logMessage, messageStats,
  allLoggedMessages, addFedAdmin, isFedAdmin, removeFedAdmin, listFedBans, addUserNote,
  listUserNotes, deleteUserNotes, getKarma,
} from "../src/db/repo.js";
import { t, LOCALES } from "../src/i18n/index.js";
import { encryptSecret, decryptSecret } from "../src/services/security.js";
import { chunkText, parseDuration, markdownToTelegramHtml } from "../src/util/format.js";
import { renderMemberTemplate } from "../src/util/placeholders.js";
import { inWindow, parseHHMM, isValidTimezone, localMinutes } from "../src/util/time.js";
import { validateInitData } from "../src/services/webapp.js";
import { createHmac } from "node:crypto";

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

// filters & blocklist
saveFilter(-100999, "hello", "Hi there!");
saveFilter(-100999, "hello", "Hi again!"); // upsert
if (listFilters(-100999).length !== 1 || listFilters(-100999)[0]!.response !== "Hi again!") throw new Error("filter upsert");
if (!deleteFilter(-100999, "hello") || deleteFilter(-100999, "hello")) throw new Error("filter delete");
addBlockedWord(-100999, "spamword");
addBlockedWord(-100999, "spamword"); // idempotent
if (listBlockedWords(-100999).length !== 1) throw new Error("blocklist");
if (!removeBlockedWord(-100999, "spamword")) throw new Error("blocklist remove");

// AFK lifecycle
setAfk(42, "lunch");
if (getAfk(42)?.reason !== "lunch") throw new Error("afk set");
if (!clearAfk(42) || clearAfk(42) || getAfk(42)) throw new Error("afk clear");

// federation: create → join → fban gates → leave
createFederation("cafe0042", "Test Fed", 7);
if (getFederation("cafe0042")?.owner_id !== 7) throw new Error("fed create");
joinFederation("cafe0042", -100999);
if (fedOfChat(-100999)?.fed_id !== "cafe0042" || fedChats("cafe0042").length !== 1) throw new Error("fed join");
addFedBan("cafe0042", 666, "spammer");
if (getFedBan("cafe0042", 666)?.reason !== "spammer" || fedBanCount("cafe0042") !== 1) throw new Error("fed ban");
if (!removeFedBan("cafe0042", 666) || getFedBan("cafe0042", 666)) throw new Error("fed unban");
if (!leaveFederation(-100999) || fedOfChat(-100999)) throw new Error("fed leave");

// fed admins + exportable ban list
addFedAdmin("cafe0042", 8);
if (!isFedAdmin("cafe0042", 8) || isFedAdmin("cafe0042", 9)) throw new Error("fed admin");
if (!removeFedAdmin("cafe0042", 8) || isFedAdmin("cafe0042", 8)) throw new Error("fed admin remove");
addFedBan("cafe0042", 777, "spam");
if (listFedBans("cafe0042").find((b) => b.user_id === 777)?.reason !== "spam") throw new Error("fed export list");
removeFedBan("cafe0042", 777);

// per-user moderation notes
addUserNote(-100999, 7, "helpful member", "Mod");
addUserNote(-100999, 7, "second note", undefined);
if (listUserNotes(-100999, 7).length !== 2 || listUserNotes(-100999, 7)[0]!.note !== "second note")
  throw new Error("user notes");
if (deleteUserNotes(-100999, 7) !== 2 || listUserNotes(-100999, 7).length) throw new Error("user notes wipe");

// karma direct read
if (getKarma(-100999, 7) !== 3 || getKarma(-100999, 999) !== 0) throw new Error("karma read");

// content-lock settings survive the JSON round-trip
updateSettings(-100999, { locks: ["stickers", "forwards"] });
if (getSettings(-100999).locks?.join(",") !== "stickers,forwards") throw new Error("locks settings");

// activity stats over the ambient log
logMessage(-100999, 1, 7, "Alice", "the quick brown fox");
logMessage(-100999, 2, 8, "Bob", "jumped over the lazy dog");
const st = messageStats(-100999);
if (st.total24h !== 2 || st.total7d !== 2 || st.topUsers.length !== 2) throw new Error("stats");
const hits = allLoggedMessages(-100999).filter((m) => m.text.includes("fox"));
if (hits.length !== 1 || hits[0]!.name !== "Alice") throw new Error("recall source");

// welcome/goodbye placeholders: substitution + injection safety
{
  const user = { id: 5, is_bot: false, first_name: "<Eve>", username: "eve" } as never;
  const chat = { id: -1, type: "supergroup", title: "My <Group>" } as never;
  const out = renderMemberTemplate("Hi {mention} ({username}) welcome to {chat}, member #{count}", user, chat, 42);
  if (!out.includes('<a href="tg://user?id=5">&lt;Eve&gt;</a>')) throw new Error("placeholder mention");
  if (!out.includes("@eve") || !out.includes("My &lt;Group&gt;") || !out.includes("#42")) throw new Error("placeholders");
  if (out.includes("<Group>")) throw new Error("placeholder escaping");
}

// night-mode window math (incl. crossing midnight)
if (!inWindow(parseHHMM("23:00")!, parseHHMM("06:00")!, parseHHMM("01:30")!)) throw new Error("night cross");
if (inWindow(parseHHMM("23:00")!, parseHHMM("06:00")!, parseHHMM("12:00")!)) throw new Error("night day");
if (!inWindow(parseHHMM("09:00")!, parseHHMM("17:00")!, parseHHMM("12:00")!)) throw new Error("night simple");
if (parseHHMM("24:00") !== undefined || parseHHMM("nope") !== undefined) throw new Error("hhmm validate");
if (!isValidTimezone("Asia/Jakarta") || isValidTimezone("Not/AZone")) throw new Error("tz validate");
if (localMinutes("UTC") < 0 || localMinutes("UTC") >= 1440) throw new Error("local minutes");

// disabled-commands & link-allowlist settings round-trip
updateSettings(-100999, { disabledCommands: ["dice"], linkAllowlist: ["example.com"], warnAction: "kick" });
{
  const s2 = getSettings(-100999);
  if (s2.disabledCommands?.[0] !== "dice" || s2.linkAllowlist?.[0] !== "example.com" || s2.warnAction !== "kick")
    throw new Error("new settings");
}

// Mini App initData HMAC validation (forge a valid signature with the test token)
{
  const token = process.env.BOT_TOKEN!;
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 42, first_name: "Test" }),
  });
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  params.set("hash", hash);
  if (validateInitData(params.toString(), token) !== 42) throw new Error("valid initData rejected");
  params.set("hash", hash.slice(0, -1) + (hash.endsWith("0") ? "1" : "0"));
  if (validateInitData(params.toString(), token) !== undefined) throw new Error("tampered initData accepted");
}

console.log("ALL SMOKE TESTS OK");
