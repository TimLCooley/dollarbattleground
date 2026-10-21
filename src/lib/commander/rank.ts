import { RANKS, type Rank } from "@/lib/ranks";

// CommanderBG ranks (Tim, 2026-10-21) — enlisted only for now, fully
// transparent. Points come from showing up:
// - post a score on the day's own puzzle (not a past day) = 1 point
// - 3+ days in a row: that day is worth 2 instead (the daily boost)
// - a perfect score adds 2 more, streak or not
// Same badges as the Battleground's enlisted ladder; thresholds are this game's.

const LADDER: [key: string, req: number][] = [
  ["recruit", 0],
  ["pvt", 1],
  ["pfc", 4],
  ["cpl", 8],
  ["sgt", 15],
  ["ssg", 25],
  ["sfc", 40],
  ["msg", 60],
  ["sgm", 85],
];
export const CMD_RANKS: (Rank & { req: number })[] = LADDER.map(([key, req]) => ({ ...RANKS.find((r) => r.key === key)!, req }));

export const STREAK_DAYS = 3; // in a row before the boost kicks in
export const PERFECT_BONUS = 2;

export type Play = { day: number; perfect: boolean };
export type CmdRank = {
  points: number;
  rank: Rank & { req: number };
  next: (Rank & { req: number }) | null;
  toNext: number;
  streak: number; // current run of days in a row (0 once broken)
  boosted: boolean; // today's play earns the boost (or did)
  plays: number;
  perfects: number;
};

/** Points, rank and streak from the days someone played on time. `today` keeps a streak alive until tomorrow ends. */
export function commanderRank(plays: Play[], today: number): CmdRank {
  const days = [...new Map(plays.map((p) => [p.day, p])).values()].sort((a, b) => a.day - b.day);
  let points = 0;
  let run = 0;
  let prev = -10;
  for (const p of days) {
    run = p.day === prev + 1 ? run + 1 : 1;
    prev = p.day;
    points += (run >= STREAK_DAYS ? 2 : 1) + (p.perfect ? PERFECT_BONUS : 0);
  }
  const alive = prev === today || prev === today - 1;
  const streak = alive ? run : 0;
  let rank = CMD_RANKS[0];
  for (const r of CMD_RANKS) if (points >= r.req) rank = r;
  const next = CMD_RANKS.find((r) => r.req > points) ?? null;
  return {
    points,
    rank,
    next,
    toNext: next ? next.req - points : 0,
    streak,
    boosted: streak + (prev === today ? 0 : 1) >= STREAK_DAYS,
    plays: days.length,
    perfects: days.filter((d) => d.perfect).length,
  };
}
