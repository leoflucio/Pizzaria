export interface Hours { weekday: number; opensAt: string; closesAt: string }

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + (m ?? 0);
};

/** Weekday (0=domingo) and minutes since midnight in the given IANA time zone. */
export function localClock(now: Date, timeZone: string): { weekday: number; minutes: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

/**
 * Open if any window contains now. A window that closes after midnight
 * (closesAt <= opensAt) also covers the early hours of the next day.
 */
export function isOpenAt(hours: Hours[], now: Date, timeZone: string): boolean {
  const { weekday, minutes } = localClock(now, timeZone);
  const yesterday = (weekday + 6) % 7;
  return hours.some((h) => {
    const o = toMin(h.opensAt);
    const c = toMin(h.closesAt);
    const overnight = c <= o;
    if (h.weekday === weekday) return overnight ? minutes >= o : minutes >= o && minutes < c;
    if (h.weekday === yesterday && overnight) return minutes < c;
    return false;
  });
}

export function nextOpening(hours: Hours[], now: Date, timeZone: string): string | null {
  const { weekday, minutes } = localClock(now, timeZone);
  for (let d = 0; d < 7; d++) {
    const wd = (weekday + d) % 7;
    const today = hours.filter((h) => h.weekday === wd).sort((a, b) => toMin(a.opensAt) - toMin(b.opensAt));
    for (const h of today) if (d > 0 || toMin(h.opensAt) > minutes) return d === 0 ? `hoje às ${h.opensAt}` : d === 1 ? `amanhã às ${h.opensAt}` : `${WEEKDAYS[wd]} às ${h.opensAt}`;
  }
  return null;
}

export const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
