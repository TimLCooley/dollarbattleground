import type { Metadata } from "next";
import { Command } from "@/components/board";

export const metadata: Metadata = {
  title: "Blue Command — Commander",
};

export default function BluePage() {
  return <Command lockedSide="blue" active="/blue" />;
}
