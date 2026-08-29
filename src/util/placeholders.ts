import type { User, Chat } from "grammy/types";
import { escapeHtml } from "./format.js";

/**
 * Welcome/goodbye template rendering with the placeholder set users know from
 * Rose/Marie-style bots. The template is HTML-escaped FIRST, then placeholders
 * are substituted with safely-escaped values, so user templates can never
 * inject markup.
 *
 * Supported: {name} {first} {last} {fullname} {username} {mention} {id}
 *            {chat} {chatname} {count}
 */
export function renderMemberTemplate(
  template: string,
  user: User,
  chat: Chat,
  memberCount?: number,
): string {
  const first = escapeHtml(user.first_name);
  const last = escapeHtml(user.last_name ?? "");
  const full = escapeHtml([user.first_name, user.last_name].filter(Boolean).join(" "));
  const username = user.username ? `@${escapeHtml(user.username)}` : first;
  const chatName = escapeHtml("title" in chat ? (chat.title ?? "") : "");
  return escapeHtml(template)
    .replaceAll("{mention}", `<a href="tg://user?id=${user.id}">${first}</a>`)
    .replaceAll("{fullname}", `<b>${full}</b>`)
    .replaceAll("{name}", `<b>${first}</b>`)
    .replaceAll("{first}", first)
    .replaceAll("{last}", last)
    .replaceAll("{username}", username)
    .replaceAll("{id}", String(user.id))
    .replaceAll("{chatname}", chatName)
    .replaceAll("{chat}", chatName)
    .replaceAll("{count}", memberCount !== undefined ? String(memberCount) : "");
}

/** Whether the template needs the (extra API call) member count. */
export function templateNeedsCount(template: string): boolean {
  return template.includes("{count}");
}
