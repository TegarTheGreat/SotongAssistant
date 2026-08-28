import { Composer, type Context } from "grammy";
import { config } from "../config.js";
import { listKnownChats, upsertChat, migrateChatId } from "../db/index.js";
import { invalidateAdminCache } from "../util/admin.js";
import { escapeHtml } from "../util/format.js";

/**
 * "Bot manager": kesadaran bot atas semua chat tempat ia berada,
 * hak adminnya di masing-masing, dan perintah status untuk owner.
 */
export const manager = new Composer<Context>();

// status bot sendiri berubah (ditambahkan, dipromosikan, ditendang, diblokir)
manager.on("my_chat_member", async (ctx) => {
  const upd = ctx.myChatMember;
  const me = upd.new_chat_member;
  const rights = me.status === "administrator" ? me : undefined;
  upsertChat(upd.chat.id, upd.chat.type, "title" in upd.chat ? upd.chat.title : undefined, me.status, rights);
  invalidateAdminCache(upd.chat.id);

  if (me.status === "member" && (upd.chat.type === "group" || upd.chat.type === "supergroup")) {
    await ctx.api
      .sendMessage(
        upd.chat.id,
        "👋 Halo! Aku SotongAssistant.\nJadikan aku <b>admin</b> (hapus pesan, restrict, undang, pin) " +
          "agar semua fitur moderasi & AI berjalan. Lalu buka /settings.",
        { parse_mode: "HTML" },
      )
      .catch(() => undefined);
  }
});

// migrasi group → supergroup: chat_id berubah — pindahkan data & jangan sampai bot "mati sunyi"
manager.on("message:migrate_to_chat_id", (ctx) => {
  const newId = ctx.message.migrate_to_chat_id;
  if (newId) migrateChatId(ctx.chat.id, newId);
});

// /status — ringkasan semua chat yang diketahui (owner saja, via DM)
manager.command("status", async (ctx) => {
  if (ctx.chat.type !== "private" || ctx.from?.id !== config.ownerId) return;
  const chats = listKnownChats();
  if (!chats.length) {
    await ctx.reply("Belum ada chat yang tercatat. Tambahkan bot ke grup/channel dulu.");
    return;
  }
  const lines = chats.map((c) => {
    const rights = c.rights ? " · admin" : "";
    return `• <b>${escapeHtml(c.title ?? String(c.chat_id))}</b> (${c.type}) — ${c.status}${rights}`;
  });
  await ctx.reply(`📋 <b>Chat yang kuketahui</b>\n${lines.join("\n")}`, { parse_mode: "HTML" });
});

manager.command("id", async (ctx) => {
  await ctx.reply(
    `chat_id: <code>${ctx.chat.id}</code>` + (ctx.from ? `\nuser_id: <code>${ctx.from.id}</code>` : ""),
    { parse_mode: "HTML" },
  );
});

manager.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.reply(
    "🦑 <b>SotongAssistant</b>\n\n" +
      "Asisten Telegram serba-bisa: moderasi grup, onboarding, channel, business, dan AI " +
      "(model apa pun dari katalog models.dev).\n\n" +
      "<b>Perintah utama</b>\n" +
      "/ask — tanya AI (di grup: bisa juga reply/mention)\n" +
      "/aimodel — pilih provider & model AI\n" +
      "/settings — pengaturan per grup (di dalam grup)\n" +
      "/setkey — (owner, DM) setel API key provider\n" +
      "/status — (owner, DM) daftar chat yang kukelola\n" +
      "/id — tampilkan chat/user id",
    { parse_mode: "HTML" },
  );
});
