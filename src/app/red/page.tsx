import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { Command } from "@/components/board";

export const metadata: Metadata = {
  title: "Red Command — CommanderBG",
  alternates: { canonical: "/battleground" },
  robots: { index: false, follow: true },
};

export default async function RedPage() {
  // The Battleground is hidden (Tim, 2026-10-30) — only the admin can still open it.
  if (!(await requireAdmin())) redirect("/");
  return <Command lockedSide="red" active="/red" />;
}
