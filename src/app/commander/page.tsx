import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommanderGame } from "@/components/commander/commander-game";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commander — a daily war puzzle | Dollar Battleground",
  description: "Place your troops, take the most ground. A new map every day, the same one for everyone. One shot.",
};

// Admin-only while the mechanics get dialed in (Tim, 2026-10-15).
export default async function CommanderPage() {
  if (process.env.NODE_ENV !== "development" && !(await requireAdmin())) notFound();
  return <CommanderGame />;
}
