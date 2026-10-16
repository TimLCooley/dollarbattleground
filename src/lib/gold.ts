// Gold square schedule: the next drop 2-4 hours from now, kept inside
// 9am-10pm Mountain; if that lands at night, the next morning between 9 and 10.
const mtHour = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hour12: false }).format(d)) % 24;

// The autopilot ticks every 10 minutes (pg_cron */10), so drops land on a
// 10-minute mark — the countdown then hits zero right as the gold appears.
const TICK = 600_000;
const onTick = (ms: number) => new Date(Math.ceil(ms / TICK) * TICK).toISOString();

export function scheduleNextGold(from: Date): string {
  let t = new Date(from.getTime() + (2 + Math.random() * 2) * 3600_000);
  if (mtHour(t) >= 9 && mtHour(t) < 22) return onTick(t.getTime());
  // walk forward to 9:00 Mountain, then add up to an hour
  t = new Date(Math.floor(t.getTime() / 900_000) * 900_000);
  for (let i = 0; i < 96 && mtHour(t) !== 9; i++) t = new Date(t.getTime() + 900_000);
  return onTick(t.getTime() + Math.random() * 3600_000);
}
