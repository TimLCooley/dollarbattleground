import type { Metadata } from "next";
import { CommanderTutorial } from "@/components/commander/tutorial";

export const metadata: Metadata = {
  title: "CommanderBG tutorial — learn to play",
  description: "Learn CommanderBG in two minutes: five quick interactive steps covering Archers, Soldiers, terrain, and why the order you place them matters.",
  alternates: { canonical: "/commander/tutorial" },
};

export default function CommanderTutorialPage() {
  return <CommanderTutorial />;
}
