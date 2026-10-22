import type { Metadata } from "next";
import { CommanderStore } from "@/components/commander/store";

export const metadata: Metadata = {
  title: "CommanderBG store — skins",
  description: "Skins for CommanderBG: color skins, your own colors, and every skin forever. Any purchase commissions you as an officer.",
  alternates: { canonical: "/store" },
};

export default async function StorePage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  return <CommanderStore paid={paid && /^cs_[A-Za-z0-9_]+$/.test(paid) ? paid : undefined} />;
}
