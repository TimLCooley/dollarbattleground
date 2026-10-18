import type { Metadata } from "next";
import { Command } from "@/components/board";

export const metadata: Metadata = {
  title: "Red Command — CommanderBG",
  alternates: { canonical: "/battleground" },
  robots: { index: false, follow: true },
};

export default function RedPage() {
  return <Command lockedSide="red" active="/red" />;
}
