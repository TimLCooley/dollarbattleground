import type { Metadata } from "next";
import { FieldReport } from "@/components/field-report";

export const metadata: Metadata = {
  title: "Field Report — Commander",
};

export default function ReportPage() {
  return <FieldReport />;
}
