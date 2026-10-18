import type { Metadata } from "next";
import { FieldReport } from "@/components/field-report";

export const metadata: Metadata = {
  title: "Field Report — CommanderBG",
};

export default function ReportPage() {
  return <FieldReport />;
}
