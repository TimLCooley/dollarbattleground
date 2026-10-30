import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { BothCommand } from "@/components/board";

export const metadata: Metadata = {
  title: "Both Commands — CommanderBG",
  alternates: { canonical: "/battleground" },
  robots: { index: false, follow: true },
};

export default async function BothPage() {
  // The Battleground is hidden (Tim, 2026-10-30) — only the admin can still open it.
  if (!(await requireAdmin())) redirect("/");
  return <BothCommand />;
}
