import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import type { Api } from "grammy";
import { config } from "./../config.js";

const run = promisify(execFile);

/**
 * Self-updater: keeps a git-deployed bot current.
 *  - /update (owner) pulls, reinstalls dependencies and exits — the process
 *    supervisor (systemd/pm2/Docker restart policy) brings the new code up.
 *  - With AUTO_UPDATE=true the hourly check applies updates automatically;
 *    otherwise the owner is notified that an update is available.
 * No-ops gracefully when the working directory is not a git checkout.
 */

export interface VersionInfo {
  version: string;
  commit?: string;
}

let cachedVersion: VersionInfo | undefined;

export async function getVersionInfo(): Promise<VersionInfo> {
  if (cachedVersion) return cachedVersion;
  let version = "0.0.0";
  try {
    version = (JSON.parse(readFileSync("package.json", "utf8")) as { version?: string }).version ?? version;
  } catch {
    /* keep default */
  }
  let commit: string | undefined;
  try {
    commit = (await run("git", ["rev-parse", "--short", "HEAD"])).stdout.trim();
  } catch {
    /* not a git checkout */
  }
  cachedVersion = { version, commit };
  return cachedVersion;
}

export function isGitCheckout(): boolean {
  return existsSync(".git");
}

/** Number of upstream commits we are behind (0 on any failure). */
export async function checkForUpdates(): Promise<number> {
  try {
    await run("git", ["fetch", "--quiet"], { timeout: 60_000 });
    const { stdout } = await run("git", ["rev-list", "--count", "HEAD..@{u}"], { timeout: 15_000 });
    return Number(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/** Fast-forward pull + dependency install. Throws with git/npm output on failure. */
export async function applyUpdate(): Promise<string> {
  const pull = await run("git", ["pull", "--ff-only"], { timeout: 120_000 });
  await run("npm", ["ci", "--no-audit", "--no-fund"], { timeout: 600_000 });
  cachedVersion = undefined;
  return pull.stdout.trim();
}

/** Hourly update check; returns a stop function. */
export function startAutoUpdater(api: Api): () => void {
  if (!isGitCheckout() || !config.ownerId) return () => undefined;
  const timer = setInterval(async () => {
    const behind = await checkForUpdates();
    if (!behind) return;
    if (config.autoUpdate) {
      await api
        .sendMessage(config.ownerId, `⬆️ Auto-update: applying ${behind} new commit(s), restarting…`)
        .catch(() => undefined);
      try {
        await applyUpdate();
        await api.sendMessage(config.ownerId, "✅ Updated. Restarting now.").catch(() => undefined);
        process.exit(0); // the supervisor restarts us on the new code
      } catch (err) {
        await api
          .sendMessage(config.ownerId, `❌ Auto-update failed: ${(err as Error).message.slice(0, 300)}`)
          .catch(() => undefined);
      }
    } else {
      await api
        .sendMessage(config.ownerId, `⬆️ Update available (${behind} commit(s) behind). Send /update to apply.`)
        .catch(() => undefined);
    }
  }, 3600_000);
  return () => clearInterval(timer);
}
