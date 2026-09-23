import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

// Seed the board with synthetic battle history so the Tile Log / "most fought"
// views have something to show before launch. Non-destructive: it ADDS events
// and repaints the touched cells. Admin-only. Wipe it all before going live.

const N = 15;
const DAY = 86_400_000;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = createAdminClient();
  const now = Date.now();

  // 10 fake combatants, split evenly across the two sides.
  const players = Array.from({ length: 10 }, (_, i) => ({
    id: randomUUID(),
    team: i % 2 === 0 ? "red" : "blue",
  }));
  const byTeam = {
    red: players.filter((p) => p.team === "red"),
    blue: players.filter((p) => p.team === "blue"),
  } as const;

  // ~95 contested cells. A handful are "hot" (many flips); most see a few.
  const cellCount = 95;
  const cells = new Set<number>();
  while (cells.size < cellCount) cells.add(Math.floor(Math.random() * N * N));

  const events: {
    x: number;
    y: number;
    team: string;
    owner_id: string;
    source: string;
    created_at: string;
  }[] = [];
  const finalTeam = new Map<number, string>();

  for (const idx of cells) {
    const x = idx % N;
    const y = Math.floor(idx / N);
    // heavy-tailed: most cells 1-5 flips, ~1 in 6 is a hot zone up to ~22
    const hot = Math.random() < 0.16;
    const flips = hot
      ? 8 + Math.floor(Math.random() * 15)
      : 1 + Math.floor(Math.random() * 5);
    // spread timestamps over the last year, biased toward recent activity
    const times = Array.from({ length: flips }, () => {
      const r = Math.random();
      const age = r < 0.35 ? Math.random() * 7 : r < 0.7 ? Math.random() * 60 : Math.random() * 365;
      return now - age * DAY;
    }).sort((a, b) => a - b);

    let team = pick(["red", "blue"]);
    for (const t of times) {
      const owner = pick(byTeam[team as "red" | "blue"]);
      events.push({
        x,
        y,
        team,
        owner_id: owner.id,
        source: Math.random() < 0.75 ? "paid" : "free",
        created_at: new Date(t).toISOString(),
      });
      team = team === "red" ? "blue" : "red"; // each flip contests it
    }
    finalTeam.set(idx, events[events.length - 1].team);
  }

  // Insert events in chunks.
  for (let i = 0; i < events.length; i += 500) {
    const { error } = await db.from("tile_events").insert(events.slice(i, i + 500));
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Paint the current board to match each cell's latest owner (owner_id null —
  // tiles.owner_id has an FK to real users, and these are synthetic).
  const tileRows = [...finalTeam.entries()].map(([idx, team]) => ({
    x: idx % N,
    y: Math.floor(idx / N),
    team,
    owner_id: null,
    updated_at: new Date().toISOString(),
  }));
  const { error: tErr } = await db.from("tiles").upsert(tileRows, { onConflict: "x,y" });
  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    events: events.length,
    cells: cells.size,
    players: players.length,
  });
}
