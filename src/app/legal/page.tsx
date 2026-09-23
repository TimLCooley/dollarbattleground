import type { Metadata } from "next";
import { Legal } from "@/components/legal";

export const metadata: Metadata = {
  title: "Field Manual — Dollar Battleground",
};

export default function LegalPage() {
  return <Legal />;
}
