import { config } from "../config.js";
import { isCoOwner, listCoOwners } from "../db/repo.js";

/**
 * Owner-level authorization.
 *
 * Two tiers on purpose:
 *  - PRIMARY owner — the first id in OWNER_ID. Manages the owner team and is
 *    the only account allowed to store provider API keys (/setkey).
 *  - Owners — the rest of OWNER_ID plus anyone added with /addowner. They run
 *    day-to-day owner commands (status, broadcast, backups, per-chat config).
 *
 * The split is what makes a co-owner safe to hand out: adding one never widens
 * access to the credentials, and a co-owner cannot promote anybody.
 */

/** May this user run owner-level commands? */
export function isOwner(userId: number | undefined): boolean {
  if (!userId) return false;
  if (config.ownerIds.includes(userId)) return true;
  try {
    return isCoOwner(userId);
  } catch {
    // A DB hiccup must never silently widen access.
    return false;
  }
}

/** May this user manage the owner team and API keys? */
export function isPrimaryOwner(userId: number | undefined): boolean {
  return Boolean(userId) && userId === config.ownerId;
}

/** Every owner id, env-configured first, de-duplicated — used for alert fan-out. */
export function ownerIds(): number[] {
  const ids = new Set<number>(config.ownerIds);
  try {
    for (const o of listCoOwners()) ids.add(o.user_id);
  } catch {
    /* keep the env-configured owners */
  }
  return [...ids];
}
