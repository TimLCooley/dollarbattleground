import type { Metadata } from "next";
import { BothCommand } from "@/components/board";

export const metadata: Metadata = {
  title: "Both Commands — Dollar Battleground",
};

export default function BothPage() {
  return <BothCommand />;
}
