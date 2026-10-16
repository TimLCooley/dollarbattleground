import type { Metadata } from "next";
import { CommanderGame } from "@/components/commander/commander-game";

export const metadata: Metadata = {
  title: "Commander — a daily war puzzle | Dollar Battleground",
  description: "Place your troops, take the most ground. A new map every day, the same one for everyone. One shot.",
};

export default function CommanderPage() {
  return <CommanderGame />;
}
