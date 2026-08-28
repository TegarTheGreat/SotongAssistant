/** Escape untuk parse_mode HTML — hanya &, <, > yang perlu. */
export function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Konversi Markdown ala LLM ke HTML Telegram yang aman.
 * Escape dulu, lalu petakan subset yang didukung Telegram.
 */
export function markdownToTelegramHtml(md: string): string {
  let s = escapeHtml(md);
  // blok kode ```lang\n...```
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) =>
    lang ? `<pre><code class="language-${lang}">${code}</code></pre>` : `<pre>${code}</pre>`,
  );
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<i>$2</i>");
  return s;
}

/** Potong teks ke potongan <= max, di batas paragraf/baris bila memungkinkan. */
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

/** Parse durasi "30m", "1h", "2d" → detik. Clamp ke aturan Telegram (35 dtk – 365 hari). */
export function parseDuration(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const m = /^(\d+)\s*(s|m|h|d)$/i.exec(input.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]!.toLowerCase() as "s" | "m" | "h" | "d"];
  // < 30 dtk atau > 366 hari dianggap PERMANEN oleh Telegram — clamp agar sesuai maksud user.
  return Math.min(Math.max(n * mult, 35), 365 * 86400);
}
