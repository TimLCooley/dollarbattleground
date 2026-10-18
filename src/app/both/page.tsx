import type { Metadata } from "next";
import { BothCommand } from "@/components/board";

export const metadata: Metadata = {
  title: "Both Commands — CommanderBG",
  alternates: { canonical: "/battleground" },
  robots: { index: false, follow: true },
};

export default function BothPage() {
  return <BothCommand />;
}
