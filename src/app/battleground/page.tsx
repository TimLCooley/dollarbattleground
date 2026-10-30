import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { HomeExperience } from "@/components/home-experience";

export const metadata: Metadata = {
  title: "CommanderBG: Battle Ground",
  description: "The Battleground: Red vs Blue on one live map. Pick a side, take squares, and help your color hold the most ground. Your first square is free — on CommanderBG.",
  alternates: { canonical: "/battleground" },
  robots: { index: false, follow: false },
  openGraph: { title: "The Battleground — Red vs Blue on one live map", url: "/battleground" },
};

// The live Red vs Blue map. It used to be the home page; Commander is now (2026-10-16).
export default async function BattlegroundPage() {
  // The Battleground is hidden (Tim, 2026-10-30) — only the admin can still open it.
  if (!(await requireAdmin())) redirect("/");
  return <HomeExperience />;
}
