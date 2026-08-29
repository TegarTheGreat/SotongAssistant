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

const BUTTON_RE = /\[([^\]\n]{1,64})\]\((https:\/\/[^\s)]+)\)/g;

/**
 * Welcome/goodbye templates may embed inline URL buttons with Markdown-link
 * syntax — `[Rules](https://t.me/c/...)`. Extract them (https only, so a
 * template can never smuggle tg:// or javascript: links into a button).
 */
export function extractButtons(template: string): {
  text: string;
  buttons: Array<{ label: string; url: string }>;
} {
  const buttons: Array<{ label: string; url: string }> = [];
  const text = template
    .replace(BUTTON_RE, (_m, label: string, url: string) => {
      const trimmed = label.trim();
      // A whitespace-only label would make Telegram reject the whole message,
      // so drop those buttons but still remove the markup from the text.
      if (trimmed && buttons.length < 6) buttons.push({ label: trimmed, url });
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, buttons };
}
