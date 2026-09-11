import type { Metadata } from "next";
import { Command } from "@/components/board";

export const metadata: Metadata = {
  title: "Blue Command — Dollar Battleground",
};

export default function BluePage() {
  return <Command lockedSide="blue" title="BLUE COMMAND" active="/blue" />;
}
