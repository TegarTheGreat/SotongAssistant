/**
 * CAS (Combot Anti-Spam) lookup — a community ban list of known spammers.
 * https://cas.chat/api  ·  ok=true means the user IS listed (banned).
 *
 * Fail-open by design: if CAS is slow or down we treat the user as clean,
 * so an outage can never lock a group. Positive hits are cached long,
 * misses are cached briefly.
 */
const cache = new Map<number, { banned: boolean; at: number }>();
const HIT_TTL_MS = 24 * 3600_000;
const MISS_TTL_MS = 3600_000;
const MAX_CACHE = 20_000;

export async function isCasBanned(userId: number): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < (hit.banned ? HIT_TTL_MS : MISS_TTL_MS)) return hit.banned;

  let banned = false;
  try {
    const res = await fetch(`https://api.cas.chat/check?user_id=${userId}`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { ok?: boolean };
      banned = json.ok === true;
    }
  } catch {
    /* fail open */
  }
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(userId, { banned, at: Date.now() });
  return banned;
}
