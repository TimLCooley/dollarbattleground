import "server-only";
import type { Db } from "@/lib/app-config";
import { buildDay, type Layout, type Placement } from "./engine";

export type Day = { day: number; layout: Layout; optimal: number; solution: Placement[] };

/** The day's puzzle — built (and solved exactly) once, then cached in commander_days. */
export async function getDay(db: Db, day: number): Promise<Day> {
  const { data } = await db.from("commander_days").select("day,layout,optimal,solution").eq("day", day).maybeSingle();
  if (data) return data as Day;
  const built = buildDay(day);
  const row = { day, layout: built.layout, optimal: built.optimal, solution: built.solution };
  await db.from("commander_days").upsert(row, { onConflict: "day", ignoreDuplicates: true });
  return row;
}

export async function histogram(db: Db, day: number) {
  const { data } = await db.rpc("commander_histogram", { p_day: day });
  return (data ?? []) as { score: number; players: number }[];
}
