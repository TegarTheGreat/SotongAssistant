import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Api } from "grammy";
import { config } from "../config.js";
import { takePendingJoinQuery } from "../db/repo.js";

/**
 * Self-hosted Mini App for the guard-bot join-request captcha (Bot API 10.1).
 *
 * Flow: a join request carrying a query_id is answered within the 10s deadline
 * by sendChatJoinRequestWebApp pointing at GET /captcha (served here). The page
 * runs inside Telegram, and on "I'm human" it POSTs its signed initData to
 * /captcha/verify. The server validates the HMAC (per Telegram's Web App spec),
 * resolves the pending query for that user, and approves the join request.
 * The query_id itself never leaves the server, so the endpoint cannot be abused.
 */

const INIT_DATA_MAX_AGE_S = 10 * 60;

/** Validate Telegram Web App initData; returns the user id when authentic. */
export function validateInitData(initData: string, botToken: string): number | undefined {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return undefined;
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    // secret_key = HMAC_SHA256(bot_token, key="WebAppData")
    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

    const authDate = Number(params.get("auth_date") ?? 0);
    if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_S) return undefined;
    const user = JSON.parse(params.get("user") ?? "{}") as { id?: number };
    return typeof user.id === "number" ? user.id : undefined;
  } catch {
    return undefined;
  }
}

/** Minimal, self-contained captcha page (Telegram Web App SDK from telegram.org). */
const CAPTCHA_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verification</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  body{margin:0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;
       justify-content:center;min-height:100vh;gap:20px;background:var(--tg-theme-bg-color,#fff);
       color:var(--tg-theme-text-color,#111);text-align:center;padding:24px}
  button{font-size:18px;padding:14px 28px;border:none;border-radius:12px;cursor:pointer;
         background:var(--tg-theme-button-color,#2AABEE);color:var(--tg-theme-button-text-color,#fff)}
  button:disabled{opacity:.6}
  #status{min-height:24px}
</style></head><body>
<h2>🦑 Quick check</h2>
<p>Tap the button to confirm you're human and join the group.</p>
<button id="go">✅ I'm human</button>
<div id="status"></div>
<script>
  const tg = window.Telegram?.WebApp; tg?.ready(); tg?.expand();
  const btn = document.getElementById("go"), status = document.getElementById("status");
  btn.addEventListener("click", async () => {
    btn.disabled = true; status.textContent = "…";
    try {
      const res = await fetch("verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg?.initData ?? "" }),
      });
      const json = await res.json();
      if (json.ok) { status.textContent = "🎉 Approved! You can close this window."; setTimeout(() => tg?.close(), 1200); }
      else { status.textContent = "❌ " + (json.error || "Verification failed."); btn.disabled = false; }
    } catch { status.textContent = "❌ Network error — try again."; btn.disabled = false; }
  });
</script></body></html>`;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
    if (chunks.reduce((n, c) => n + c.length, 0) > 64_000) break; // initData is small
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Route /captcha requests; returns false when the URL is not ours. */
export async function handleWebAppRequest(req: IncomingMessage, res: ServerResponse, api: Api): Promise<boolean> {
  const url = (req.url ?? "").split("?")[0]!;
  if (!url.startsWith("/captcha")) return false;

  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(CAPTCHA_HTML);
    return true;
  }

  if (req.method === "POST" && url === "/captcha/verify") {
    try {
      const body = JSON.parse(await readBody(req)) as { initData?: string };
      const userId = validateInitData(body.initData ?? "", config.botToken);
      if (!userId) {
        json(res, 200, { ok: false, error: "Invalid session — reopen from Telegram." });
        return true;
      }
      const pending = takePendingJoinQuery(userId);
      if (!pending) {
        json(res, 200, { ok: false, error: "No pending join request found." });
        return true;
      }
      const raw = api.raw as unknown as Record<string, (p: unknown) => Promise<unknown>>;
      await raw
        .answerChatJoinRequestQuery!({ chat_join_request_query_id: pending.query_id, result: "approve" })
        .catch(() => api.approveChatJoinRequest(pending.chat_id, userId));
      json(res, 200, { ok: true });
    } catch (err) {
      console.warn("captcha verify failed:", (err as Error).message);
      json(res, 200, { ok: false, error: "Server error — try again." });
    }
    return true;
  }

  json(res, 404, { ok: false });
  return true;
}
