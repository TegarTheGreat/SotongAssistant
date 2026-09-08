import type { Api } from "grammy";
import { config } from "../config.js";
import { overdueJobCount } from "../db/repo.js";
import { metrics } from "./dashboard.js";
import { ownerIds } from "./owners.js";

/**
 * Operational alerting: watch the two signals that mean "the bot looks healthy
 * but is not" — a spike in caught handler errors, and a job queue that stopped
 * draining — and DM every owner when either crosses its threshold.
 *
 * Design notes:
 *  - EDGE triggered. One message when a condition starts, one when it clears.
 *    A condition that stays bad re-notifies only after RENOTIFY_MS, so a long
 *    outage costs a handful of messages instead of one per check.
 *  - The error signal is a DELTA over a sliding window, not a total, so a
 *    long-lived process is not permanently "alerting" because of old errors.
 *  - State is in memory on purpose: after a restart the first check re-arms
 *    from a clean slate, which is the right behaviour for a liveness signal.
 *
 * Thresholds come from ALERT_ERRORS_PER_5M / ALERT_JOB_BACKLOG; setting either
 * to 0 disables that check.
 */

const WINDOW_MS = 5 * 60_000;
const RENOTIFY_MS = 30 * 60_000;

interface Condition {
  firing: boolean;
  lastNotified: number;
}

const state: Record<"errors" | "backlog", Condition> = {
  errors: { firing: false, lastNotified: 0 },
  backlog: { firing: false, lastNotified: 0 },
};

/** Sliding window baseline for the monotonic error counter. */
let windowStartedAt = Date.now();
let errorsAtWindowStart = 0;

async function notifyOwners(api: Api, text: string): Promise<void> {
  for (const id of ownerIds()) {
    await api
      .sendMessage(id, text, { parse_mode: "HTML" })
      .catch((e: unknown) => console.warn(`alert to ${id} failed:`, (e as Error).message));
  }
}

/**
 * Decide whether to send for one condition. Returns the message to deliver, or
 * undefined when nothing changed enough to be worth an owner's attention.
 */
function transition(
  cond: Condition,
  bad: boolean,
  now: number,
  firingText: () => string,
  recoveredText: () => string,
): string | undefined {
  if (bad) {
    const fresh = !cond.firing;
    const stale = now - cond.lastNotified >= RENOTIFY_MS;
    cond.firing = true;
    if (fresh || stale) {
      cond.lastNotified = now;
      return firingText();
    }
    return undefined;
  }
  if (cond.firing) {
    cond.firing = false;
    cond.lastNotified = 0;
    return recoveredText();
  }
  return undefined;
}

/**
 * Evaluate both conditions once. Safe to call every minute; it only talks to
 * Telegram on a state change or after the re-notify interval.
 */
export async function checkAlerts(api: Api): Promise<void> {
  if (!ownerIds().length) return;
  const now = Date.now();
  const messages: string[] = [];

  // ---- error rate over the sliding window ----
  if (config.alertErrorsPer5m > 0 && now - windowStartedAt >= WINDOW_MS) {
    const inWindow = metrics.errors - errorsAtWindowStart;
    windowStartedAt = now;
    errorsAtWindowStart = metrics.errors;
    const msg = transition(
      state.errors,
      inWindow >= config.alertErrorsPer5m,
      now,
      () =>
        `🚨 <b>Error rate high</b>\n${inWindow} errors in the last 5 minutes ` +
        `(threshold ${config.alertErrorsPer5m}).`,
      () => "✅ Recovered: error rate is back to normal.",
    );
    if (msg) messages.push(msg);
  }

  // ---- job backlog ----
  if (config.alertJobBacklog > 0) {
    let overdue = 0;
    try {
      overdue = overdueJobCount();
    } catch {
      return; // DB unreachable — the next tick will tell the same story
    }
    const msg = transition(
      state.backlog,
      overdue >= config.alertJobBacklog,
      now,
      () =>
        `🚨 <b>Job backlog</b>\n${overdue} jobs are past due ` +
        `(threshold ${config.alertJobBacklog}). The runner may be stuck.`,
      () => "✅ Recovered: the job queue is draining again.",
    );
    if (msg) messages.push(msg);
  }

  for (const m of messages) await notifyOwners(api, m);
}

/** Current alert state, surfaced by /status and the dashboard. */
export function alertStatus(): { errors: boolean; backlog: boolean } {
  return { errors: state.errors.firing, backlog: state.backlog.firing };
}
