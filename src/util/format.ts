/** Escape for Telegram parse_mode HTML — only &, < and > are special. */
export function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Convert LLM-style Markdown to the HTML subset Telegram supports.
 * Input is escaped first, so user/model text can never inject entities.
 */
export function markdownToTelegramHtml(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) =>
    lang ? `<pre><code class="language-${lang}">${code}</code></pre>` : `<pre>${code}</pre>`,
  );
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<i>$2</i>");
  return s;
}

/** Split text into chunks of at most `max` chars, preferring paragraph/line breaks. */
export function chunkText(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Parse a duration like "30m", "1h", "2d" into seconds, clamped to Telegram's
 * valid restriction window: values below 30s or above 366 days are treated as
 * PERMANENT by Telegram, so we clamp to [35s, 365d] to preserve user intent.
 */
export function parseDuration(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const m = /^(\d+)\s*(s|m|h|d)$/i.exec(input.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]!.toLowerCase() as "s" | "m" | "h" | "d"];
  return Math.min(Math.max(n * mult, 35), 365 * 86400);
}

/** Human-friendly duration in minutes/hours/days. */
export function humanDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
