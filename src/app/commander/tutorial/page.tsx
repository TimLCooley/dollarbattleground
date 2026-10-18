import type { Metadata } from "next";
import { CommanderTutorial } from "@/components/commander/tutorial";

export const metadata: Metadata = {
  title: "Commander tutorial — learn to play",
  description: "Five quick steps on the same map as the how-to-play video: Archers, Soldiers, terrain, and why the order you place them matters.",
};

export default function CommanderTutorialPage() {
  return <CommanderTutorial />;
}
