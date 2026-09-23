import type { Metadata } from "next";
import { Settings } from "@/components/settings";

export const metadata: Metadata = {
  title: "Settings — Dollar Battleground",
};

export default function SettingsPage() {
  return <Settings />;
}
