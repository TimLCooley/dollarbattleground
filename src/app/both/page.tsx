import type { Metadata } from "next";
import { BothCommand } from "@/components/board";

export const metadata: Metadata = {
  title: "Both Commands — Commander",
};

export default function BothPage() {
  return <BothCommand />;
}
