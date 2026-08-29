/** Timezone helpers for night mode & displays. All inputs are IANA zone names. */

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Minutes since local midnight in the given timezone (default UTC). */
export function localMinutes(tz: string | undefined, now = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = fmt.format(now).split(":").map(Number);
  return (h! % 24) * 60 + m!;
}

/** Local "HH:MM" string in the given timezone (default UTC). */
export function localHHMM(tz: string | undefined, now = new Date()): string {
  const mins = localMinutes(tz, now);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function parseHHMM(s: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? mins : undefined;
}

/**
 * Is `nowMins` inside the [start, end) window? Windows may cross midnight
 * (23:00–06:00). A zero-length window is treated as always off.
 */
export function inWindow(startMins: number, endMins: number, nowMins: number): boolean {
  if (startMins === endMins) return false;
  return startMins < endMins
    ? nowMins >= startMins && nowMins < endMins
    : nowMins >= startMins || nowMins < endMins;
}
