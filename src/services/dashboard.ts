import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./../config.js";
import { validateInitData } from "./webapp.js";
import { listKnownChats, messageStats, getSettings, countRows } from "../db/repo.js";
import { getVersionInfo } from "./updater.js";
import { escapeHtml } from "../util/format.js";

/**
 * Read-only web dashboard + operational endpoints, served by the same HTTP
 * server that already hosts the Mini App captcha.
 *
 *   GET  /healthz    — liveness probe (no auth, no data)
 *   GET  /metrics    — Prometheus exposition (optionally token-gated)
 *   GET  /dashboard  — Mini App page
 *   POST /dashboard/data — stats JSON, authenticated with Telegram initData
 *
 * Security: the page itself is a shell with no data in it. Numbers only come
 * from the POST endpoint, which requires a valid, fresh Mini App signature AND
 * that the caller is the bot OWNER — so opening the URL directly reveals
 * nothing.
 */

const bootedAt = Date.now();

/** Counters exposed to Prometheus. Incremented from the bot's hot paths. */
export const metrics = {
  updates: 0,
  aiAnswers: 0,
  moderationActions: 0,
  jobsRun: 0,
  errors: 0,
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 100_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const DASHBOARD_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SotongAssistant</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 16px;
         background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #111); }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: var(--tg-theme-hint-color, #777); font-size: 13px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .card { background: var(--tg-theme-secondary-bg-color, #f3f3f3); border-radius: 12px; padding: 12px; }
  .n { font-size: 22px; font-weight: 600; }
  .l { font-size: 12px; color: var(--tg-theme-hint-color, #777); }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 14px; }
  th, td { text-align: left; padding: 7px 4px; border-bottom: 1px solid var(--tg-theme-hint-color, #ddd); }
  th { font-size: 12px; color: var(--tg-theme-hint-color, #777); font-weight: 500; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  #err { color: #c00; }
</style></head><body>
<h1>🦑 SotongAssistant</h1>
<div class="sub" id="ver">loading…</div>
<div class="grid" id="cards"></div>
<table id="chats"><thead><tr><th>Chat</th><th class="num">24h</th><th class="num">7d</th></tr></thead><tbody></tbody></table>
<p id="err"></p>
<script>
  const tg = window.Telegram?.WebApp; tg?.ready(); tg?.expand();
  fetch("/dashboard/data", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: tg?.initData || "" }),
  }).then(r => r.json()).then(d => {
    if (!d.ok) { document.getElementById("err").textContent = d.error || "Unauthorized"; return; }
    document.getElementById("ver").textContent =
      "v" + d.version + " · uptime " + d.uptime + " · " + d.chats + " chats";
    document.getElementById("cards").innerHTML = d.cards
      .map(c => '<div class="card"><div class="n">' + c.v + '</div><div class="l">' + c.k + "</div></div>")
      .join("");
    document.querySelector("#chats tbody").innerHTML = d.rows
      .map(r => "<tr><td>" + r.title + '</td><td class="num">' + r.h24 + '</td><td class="num">' + r.d7 + "</td></tr>")
      .join("");
  }).catch(e => { document.getElementById("err").textContent = String(e); });
</script></body></html>`;

function humanUptime(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/** Route dashboard/health/metrics URLs; returns false when the URL is not ours. */
export async function handleDashboardRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = (req.url ?? "").split("?")[0]!;

  if (url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, uptime_s: Math.floor((Date.now() - bootedAt) / 1000) }));
    return true;
  }

  if (url === "/metrics") {
    // Optional shared-secret gate: set METRICS_TOKEN to require ?token=…
    if (config.metricsToken && new URL(req.url ?? "/", "http://x").searchParams.get("token") !== config.metricsToken) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("forbidden");
      return true;
    }
    const lines = [
      "# HELP sotong_uptime_seconds Seconds since the bot started.",
      "# TYPE sotong_uptime_seconds gauge",
      `sotong_uptime_seconds ${Math.floor((Date.now() - bootedAt) / 1000)}`,
      "# HELP sotong_updates_total Telegram updates processed.",
      "# TYPE sotong_updates_total counter",
      `sotong_updates_total ${metrics.updates}`,
      "# HELP sotong_ai_answers_total AI answers delivered.",
      "# TYPE sotong_ai_answers_total counter",
      `sotong_ai_answers_total ${metrics.aiAnswers}`,
      "# HELP sotong_moderation_actions_total Moderation actions executed.",
      "# TYPE sotong_moderation_actions_total counter",
      `sotong_moderation_actions_total ${metrics.moderationActions}`,
      "# HELP sotong_jobs_total Scheduled jobs executed.",
      "# TYPE sotong_jobs_total counter",
      `sotong_jobs_total ${metrics.jobsRun}`,
      "# HELP sotong_errors_total Handler errors caught.",
      "# TYPE sotong_errors_total counter",
      `sotong_errors_total ${metrics.errors}`,
      "# HELP sotong_chats Known chats by kind.",
      "# TYPE sotong_chats gauge",
      `sotong_chats ${listKnownChats().length}`,
    ];
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    res.end(lines.join("\n") + "\n");
    return true;
  }

  if (url === "/dashboard" && req.method === "GET") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(DASHBOARD_HTML);
    return true;
  }

  if (url === "/dashboard/data" && req.method === "POST") {
    res.setHeader("content-type", "application/json");
    try {
      const body = JSON.parse(await readBody(req)) as { initData?: string };
      const userId = validateInitData(body.initData ?? "", config.botToken);
      // Owner-only: the dashboard aggregates every managed chat.
      if (!userId || userId !== config.ownerId) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, error: "Owner only — open this from the bot's menu." }));
        return true;
      }
      const v = await getVersionInfo();
      const chats = listKnownChats().filter((c) => c.type !== "private");
      const rows = chats.slice(0, 25).map((c) => {
        const st = messageStats(c.chat_id);
        return { title: escapeHtml(c.title ?? String(c.chat_id)), h24: st.total24h, d7: st.total7d };
      });
      const aiOn = chats.filter((c) => getSettings(c.chat_id).ai).length;
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          version: v.version,
          uptime: humanUptime(Date.now() - bootedAt),
          chats: chats.length,
          rows,
          cards: [
            { k: "AI answers", v: metrics.aiAnswers },
            { k: "Moderation", v: metrics.moderationActions },
            { k: "Jobs run", v: metrics.jobsRun },
            { k: "Updates", v: metrics.updates },
            { k: "Chats with AI", v: aiOn },
            { k: "Notes stored", v: countRows("notes") },
          ],
        }),
      );
    } catch {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: false, error: "Server error" }));
    }
    return true;
  }

  return false;
}
