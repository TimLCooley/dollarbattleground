import type { Metadata } from "next";
import { CommanderGame } from "@/components/commander/commander-game";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commander — a daily war puzzle | Dollar Battleground",
  description: "Place your troops, take the most ground. A new map every day, the same one for everyone. One shot.",
};

// Open to anyone with the link (Tim, 2026-10-16); not linked from the main map yet.
export default async function CommanderPage({ searchParams }: { searchParams: Promise<{ day?: string; unsubscribed?: string }> }) {
  const sp = await searchParams;
  const day = sp.day && /^\d+$/.test(sp.day) ? Number(sp.day) : undefined;
  // keyed by day so flipping between days starts each board fresh
  return <CommanderGame key={day ?? "today"} day={day} unsubscribed={sp.unsubscribed === "1"} />;
}
