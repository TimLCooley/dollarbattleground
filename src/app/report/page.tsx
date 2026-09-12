import type { Metadata } from "next";
import { FieldReport } from "@/components/field-report";

export const metadata: Metadata = {
  title: "Field Report — Dollar Battleground",
};

export default function ReportPage() {
  return <FieldReport />;
}
