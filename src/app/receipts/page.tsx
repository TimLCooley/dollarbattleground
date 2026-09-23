import type { Metadata } from "next";
import { Receipts } from "@/components/receipts";

export const metadata: Metadata = {
  title: "Receipts — Dollar Battleground",
};

export default function ReceiptsPage() {
  return <Receipts />;
}
