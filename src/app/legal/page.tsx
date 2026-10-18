import type { Metadata } from "next";
import { Legal } from "@/components/legal";

export const metadata: Metadata = {
  title: "Field Manual — Commander",
};

export default function LegalPage() {
  return <Legal />;
}
