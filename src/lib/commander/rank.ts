import { RANKS, type Rank } from "@/lib/ranks";

// CommanderBG ranks — fully transparent. Points come from showing up:
// - post a score on the day's own puzzle (not a past day) = 1 point
// - 3+ days in a row: that day is worth 2 instead (the daily boost)
// - a perfect score adds 2 more, streak or not
//
// Rescaled 2026-10-22 (Tim): the whole ladder takes ~2 years playing every day
// with the boost, ~3 years for a casual player. Two ladders, same badges as the
// Battleground:
// - enlisted: Recruit → Sergeant Major
// - officers: anyone who has bought something (store or Battleground) is
//   commissioned and starts at 2nd Lieutenant, climbing on points earned from
//   that day on — so buying early pays.
// Ranks held at the rescale never drop (commander_profile.rank_floor).

type Step = Rank & { req: number };
const ladder = (steps: [key: string, req: number][]): Step[] => steps.map(([key, req]) => ({ ...RANKS.find((r) => r.key === key)!, req }));

export const ENLISTED_RANKS = ladder([
  ["recruit", 0],
  ["pvt", 1],
  ["pfc", 12],
  ["cpl", 40],
  ["sgt", 100],
  ["ssg", 220],
  ["sfc", 450],
  ["msg", 900],
  ["sgm", 1750],
]);
export const OFFICER_RANKS = ladder([
  ["2lt", 0],
  ["1lt", 40],
  ["cpt", 100],
  ["maj", 200],
  ["ltc", 350],
  ["col", 550],
  ["bg", 800],
  ["mg", 1100],
  ["ltg", 1400],
  ["gen", 1750],
]);
/** Kept for older imports: the enlisted ladder. */
export const CMD_RANKS = ENLISTED_RANKS;

export const STREAK_DAYS = 3; // in a row before the boost kicks in
export const PERFECT_BONUS = 2;

export type Play = { day: number; perfect: boolean };
export type CmdRank = {
  track: "enlisted" | "officer";
  points: number; // points on this track (officers: since commissioned)
  totalPoints: number; // everything ever earned
  rank: Step;
  next: Step | null;
  toNext: number;
  floored: boolean; // shown at a rank held before the rescale
  streak: number; // current run of days in a row (0 once broken)
  boosted: boolean; // today's play earns the boost (or did)
  plays: number;
  perfects: number;
};

/**
 * Points, rank and streak from the days someone played on time.
 * `today` keeps a streak alive until tomorrow ends; `officerSinceDay` is the
 * puzzle day of their first purchase; `floorKey` is a rank they can't drop below.
 */
export function commanderRank(plays: Play[], today: number, opts: { officerSinceDay?: number | null; floorKey?: string | null } = {}): CmdRank {
  const days = [...new Map(plays.map((p) => [p.day, p])).values()].sort((a, b) => a.day - b.day);
  const officer = opts.officerSinceDay != null;
  let total = 0;
  let sinceCommission = 0;
  let run = 0;
  let prev = -10;
  for (const p of days) {
    run = p.day === prev + 1 ? run + 1 : 1;
    prev = p.day;
    const earned = (run >= STREAK_DAYS ? 2 : 1) + (p.perfect ? PERFECT_BONUS : 0);
    total += earned;
    if (officer && p.day >= opts.officerSinceDay!) sinceCommission += earned;
  }
  const steps = officer ? OFFICER_RANKS : ENLISTED_RANKS;
  const points = officer ? sinceCommission : total;
  let at = 0;
  steps.forEach((r, k) => points >= r.req && (at = k));
  const floorAt = steps.findIndex((r) => r.key === opts.floorKey);
  const floored = floorAt > at;
  if (floored) at = floorAt;
  const next = steps[at + 1] ?? null;
  const alive = prev === today || prev === today - 1;
  const streak = alive ? run : 0;
  return {
    track: officer ? "officer" : "enlisted",
    points,
    totalPoints: total,
    rank: steps[at],
    next,
    toNext: next ? Math.max(0, next.req - points) : 0,
    floored,
    streak,
    boosted: streak + (prev === today ? 0 : 1) >= STREAK_DAYS,
    plays: days.length,
    perfects: days.filter((d) => d.perfect).length,
  };
}
