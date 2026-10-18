import type { Metadata } from "next";
import { Receipts } from "@/components/receipts";

export const metadata: Metadata = {
  title: "Receipts — CommanderBG",
};

export default function ReceiptsPage() {
  return <Receipts />;
}
