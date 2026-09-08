import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./../config.js";
import { validateInitData } from "./webapp.js";
import {
  listKnownChats,
  messageStats,
  getSettings,
  countRows,
  dailyMessageCounts,
  topPosters,
  aiSpendByChat,
  aiSpendForChat,
  aiSpendByModel,
  aiCostThisMonth,
  overdueJobCount,
} from "../db/repo.js";
import { getVersionInfo } from "./updater.js";
import { isOwner } from "./owners.js";
import { alertStatus } from "./alerts.js";
import { formatUsd, formatTokens } from "./spend.js";
import { embeddingCachePersisted } from "./embeddings.js";
import { escapeHtml } from "../util/format.js";

/**
 * Read-only web dashboard + operational endpoints, served by the same HTTP
 * server that already hosts the Mini App captcha.
 *
 *   GET  /healthz    — liveness probe (no auth, no data)
 *   GET  /metrics    — Prometheus exposition (optionally token-gated)
 *   GET  /dashboard  — Mini App page
 *   POST /dashboard/data — stats JSON, authenticated with Telegram initData
 *                          (send {chatId} to drill down into a single chat)
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
  h2 { font-size: 14px; margin: 22px 0 6px; font-weight: 600; }
  .sub { color: var(--tg-theme-hint-color, #777); font-size: 13px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .card { background: var(--tg-theme-secondary-bg-color, #f3f3f3); border-radius: 12px; padding: 12px; }
  .n { font-size: 22px; font-weight: 600; }
  .l { font-size: 12px; color: var(--tg-theme-hint-color, #777); }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
  th, td { text-align: left; padding: 7px 4px; border-bottom: 1px solid var(--tg-theme-hint-color, #ddd); }
  th { font-size: 12px; color: var(--tg-theme-hint-color, #777); font-weight: 500; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.link { cursor: pointer; }
  tr.link:active { background: var(--tg-theme-secondary-bg-color, #f3f3f3); }
  .spark { width: 100%; height: 56px; display: block; margin-top: 8px; }
  .spark path { fill: none; stroke: var(--tg-theme-link-color, #2481cc); stroke-width: 2;
                stroke-linejoin: round; stroke-linecap: round; }
  .spark .area { fill: var(--tg-theme-link-color, #2481cc); opacity: .12; stroke: none; }
  .back { display: inline-block; margin-bottom: 10px; color: var(--tg-theme-link-color, #2481cc);
          cursor: pointer; font-size: 14px; }
  .warn { color: #c77700; font-size: 13px; margin-top: 10px; }
  #err { color: #c00; }
</style></head><body>
<h1>🦑 SotongAssistant</h1>
<div class="sub" id="ver">loading…</div>
<div id="view"></div>
<p id="err"></p>
<script>
  const tg = window.Telegram?.WebApp; tg?.ready(); tg?.expand();
  const view = document.getElementById("view");
  const esc = (s) => String(s ?? "");

  // Inline sparkline: one path for the line, one filled area underneath.
  function spark(series) {
    if (!series || series.length < 2) return "";
    const w = 300, h = 56, pad = 3;
    const max = Math.max(1, ...series.map(p => p.n));
    const x = (i) => pad + (i * (w - 2 * pad)) / (series.length - 1);
    const y = (n) => h - pad - (n / max) * (h - 2 * pad);
    const line = series.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.n).toFixed(1)).join(" ");
    const area = line + " L" + x(series.length - 1).toFixed(1) + " " + (h - pad) + " L" + pad + " " + (h - pad) + " Z";
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' +
           '<path class="area" d="' + area + '"/><path d="' + line + '"/></svg>' +
           '<div class="l">' + series[0].day + " → " + series[series.length - 1].day +
           " · peak " + max + "/day</div>";
  }

  function cards(list) {
    return '<div class="grid">' + list
      .map(c => '<div class="card"><div class="n">' + esc(c.v) + '</div><div class="l">' + esc(c.k) + "</div></div>")
      .join("") + "</div>";
  }

  function renderOverview(d) {
    view.innerHTML =
      cards(d.cards) +
      "<h2>Messages · last 14 days</h2>" + spark(d.series) +
      (d.alerts && (d.alerts.errors || d.alerts.backlog)
        ? '<div class="warn">⚠️ Active alert: ' +
          [d.alerts.errors ? "error rate" : "", d.alerts.backlog ? "job backlog" : ""].filter(Boolean).join(" · ") +
          "</div>"
        : "") +
      "<h2>Chats</h2>" +
      '<table><thead><tr><th>Chat</th><th class="num">24h</th><th class="num">7d</th><th class="num">AI $</th></tr></thead><tbody>' +
      d.rows.map(r =>
        '<tr class="link" data-id="' + r.id + '"><td>' + esc(r.title) + '</td><td class="num">' + r.h24 +
        '</td><td class="num">' + r.d7 + '</td><td class="num">' + esc(r.cost) + "</td></tr>").join("") +
      "</tbody></table>";
    view.querySelectorAll("tr.link").forEach(tr =>
      tr.addEventListener("click", () => load(Number(tr.dataset.id))));
  }

  function renderChat(d) {
    view.innerHTML =
      '<span class="back">← All chats</span>' +
      "<h2>" + esc(d.title) + "</h2>" +
      cards(d.cards) +
      "<h2>Messages · last 14 days</h2>" + spark(d.series) +
      (d.models.length
        ? "<h2>AI models · 30 days</h2>" +
          '<table><thead><tr><th>Model</th><th class="num">Calls</th><th class="num">$</th></tr></thead><tbody>' +
          d.models.map(m =>
            "<tr><td>" + esc(m.name) + '</td><td class="num">' + m.calls +
            '</td><td class="num">' + esc(m.cost) + "</td></tr>").join("") +
          "</tbody></table>"
        : "") +
      "<h2>Top posters · 7 days</h2>" +
      '<table><thead><tr><th>Member</th><th class="num">Messages</th></tr></thead><tbody>' +
      (d.posters.length
        ? d.posters.map(p => "<tr><td>" + esc(p.name) + '</td><td class="num">' + p.n + "</td></tr>").join("")
        : '<tr><td colspan="2" class="l">No logged messages yet.</td></tr>') +
      "</tbody></table>" +
      '<div class="l" style="margin-top:12px">' + esc(d.settings) + "</div>";
    view.querySelector(".back").addEventListener("click", () => load());
  }

  function load(chatId) {
    document.getElementById("err").textContent = "";
    fetch("/dashboard/data", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData: tg?.initData || "", chatId }),
    }).then(r => r.json()).then(d => {
      if (!d.ok) { document.getElementById("err").textContent = d.error || "Unauthorized"; return; }
      document.getElementById("ver").textContent =
        "v" + d.version + " · uptime " + d.uptime + " · " + d.chats + " chats";
      if (d.chat) renderChat(d); else renderOverview(d);
      window.scrollTo(0, 0);
    }).catch(e => { document.getElementById("err").textContent = String(e); });
  }
  load();
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
      "# HELP sotong_job_backlog Jobs already past their due time.",
      "# TYPE sotong_job_backlog gauge",
      `sotong_job_backlog ${overdueJobCount()}`,
      "# HELP sotong_ai_cost_usd_30d Estimated AI spend over the last 30 days.",
      "# TYPE sotong_ai_cost_usd_30d gauge",
      `sotong_ai_cost_usd_30d ${aiSpendByChat(30)
        .reduce((sum, r) => sum + (r.cost_usd ?? 0), 0)
        .toFixed(6)}`,
      "# HELP sotong_embedding_cache_rows Vectors kept in the persistent embedding cache.",
      "# TYPE sotong_embedding_cache_rows gauge",
      `sotong_embedding_cache_rows ${embeddingCachePersisted()}`,
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
      const body = JSON.parse(await readBody(req)) as { initData?: string; chatId?: number };
      const userId = validateInitData(body.initData ?? "", config.botToken);
      // Owner-only: the dashboard aggregates every managed chat.
      if (!isOwner(userId)) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, error: "Owner only — open this from the bot's menu." }));
        return true;
      }
      const v = await getVersionInfo();
      const chats = listKnownChats().filter((c) => c.type !== "private");
      const base = {
        ok: true as const,
        version: v.version,
        uptime: humanUptime(Date.now() - bootedAt),
        chats: chats.length,
      };

      // ---- drill-down: one chat ----
      // Restricted to chats the bot actually manages, so a crafted id cannot
      // fish for rows belonging to anything else.
      const target = body.chatId === undefined ? undefined : chats.find((c) => c.chat_id === body.chatId);
      if (body.chatId !== undefined && !target) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: false, error: "Unknown chat." }));
        return true;
      }
      if (target) {
        const st = messageStats(target.chat_id);
        const spend = aiSpendForChat(target.chat_id, 30);
        const s = getSettings(target.chat_id);
        res.writeHead(200);
        res.end(
          JSON.stringify({
            ...base,
            chat: true,
            title: escapeHtml(target.title ?? String(target.chat_id)),
            series: dailyMessageCounts(14, target.chat_id),
            posters: topPosters(target.chat_id, 7, 10).map((p) => ({
              name: escapeHtml(p.name),
              n: p.n,
            })),
            cards: [
              { k: "Messages 24h", v: st.total24h },
              { k: "Messages 7d", v: st.total7d },
              { k: "AI calls 30d", v: spend.calls },
              { k: "Tokens 30d", v: formatTokens(spend.inTokens + spend.outTokens) },
              { k: "AI cost 30d", v: `$${formatUsd(spend.costUsd)}` },
            ],
            models: aiSpendByModel(30, target.chat_id)
              .slice(0, 5)
              .map((m) => ({
                name: escapeHtml(`${m.provider}/${m.model}`),
                calls: m.calls,
                cost: formatUsd(m.cost_usd),
              })),
            settings:
              `AI ${s.ai ? "on" : "off"} · captcha ${s.captcha ? "on" : "off"} · ` +
              `links ${s.antilink ? s.antilinkMode : "off"} · warns ${s.warnLimit} (${s.warnAction})` +
              (s.aiDailyLimit ? ` · quota ${s.aiDailyLimit}/day` : "") +
              (s.aiBudgetUsd
                ? ` · budget $${formatUsd(aiCostThisMonth(target.chat_id))}/$${formatUsd(s.aiBudgetUsd)} this month`
                : "") +
              (s.language ? ` · lang ${s.language}` : ""),
          }),
        );
        return true;
      }

      // ---- overview ----
      const spendByChat = new Map(aiSpendByChat(30).map((r) => [r.chat_id, r]));
      const rows = chats.slice(0, 50).map((c) => {
        const st = messageStats(c.chat_id);
        return {
          id: c.chat_id,
          title: escapeHtml(c.title ?? String(c.chat_id)),
          h24: st.total24h,
          d7: st.total7d,
          cost: formatUsd(spendByChat.get(c.chat_id)?.cost_usd ?? 0),
        };
      });
      const aiOn = chats.filter((c) => getSettings(c.chat_id).ai).length;
      const totalCost = [...spendByChat.values()].reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ...base,
          series: dailyMessageCounts(14),
          rows,
          alerts: alertStatus(),
          cards: [
            { k: "AI answers", v: metrics.aiAnswers },
            { k: "AI cost 30d", v: `$${formatUsd(totalCost)}` },
            { k: "Moderation", v: metrics.moderationActions },
            { k: "Jobs run", v: metrics.jobsRun },
            { k: "Errors", v: metrics.errors },
            { k: "Chats with AI", v: aiOn },
            { k: "Notes stored", v: countRows("notes") },
            { k: "Cached vectors", v: embeddingCachePersisted() },
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
