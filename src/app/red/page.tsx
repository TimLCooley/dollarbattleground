import type { Metadata } from "next";
import { Command } from "@/components/board";

export const metadata: Metadata = {
  title: "Red Command — Commander",
};

export default function RedPage() {
  return <Command lockedSide="red" active="/red" />;
}
