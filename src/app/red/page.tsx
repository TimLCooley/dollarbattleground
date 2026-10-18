import type { Metadata } from "next";
import { Command } from "@/components/board";

export const metadata: Metadata = {
  title: "Red Command — CommanderBG",
};

export default function RedPage() {
  return <Command lockedSide="red" active="/red" />;
}
