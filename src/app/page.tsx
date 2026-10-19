import type { Metadata } from "next";
import { CommanderGame } from "@/components/commander/commander-game";
import { AboutCommander } from "@/components/commander/about";

export const dynamic = "force-dynamic";

const DESC = "CommanderBG is a free daily strategy puzzle: place Archers and Soldiers to take the most ground. A new map every day, the same for everyone — practice as much as you like, one shot counts.";
export const metadata: Metadata = {
  title: "CommanderBG — a free daily strategy puzzle",
  description: DESC,
  alternates: { canonical: "/" },
  openGraph: { title: "CommanderBG — a free daily strategy puzzle", description: DESC, url: "/" },
  twitter: { card: "summary_large_image", title: "CommanderBG — a free daily strategy puzzle", description: DESC },
};

// Home is Commander (Tim, 2026-10-16); the Red vs Blue map lives at /battleground.
export default async function Home({ searchParams }: { searchParams: Promise<{ day?: string; unsubscribed?: string }> }) {
  const sp = await searchParams;
  const day = sp.day && /^\d+$/.test(sp.day) ? Number(sp.day) : undefined;
  // keyed by day so flipping between days starts each board fresh
  return (
    <>
      <CommanderGame key={day ?? "today"} day={day} unsubscribed={sp.unsubscribed === "1"} />
      <AboutCommander />
    </>
  );
}
