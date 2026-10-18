import type { Metadata } from "next";
import { HomeExperience } from "@/components/home-experience";

export const metadata: Metadata = {
  title: "The Battleground — CommanderBG",
  description: "Red vs Blue on one shared map. Take squares for your side.",
};

// The live Red vs Blue map. It used to be the home page; Commander is now (2026-10-16).
export default function BattlegroundPage() {
  return <HomeExperience />;
}
