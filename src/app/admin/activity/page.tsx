import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin-shell";
import { ActivityFeed } from "@/components/activity-feed";
import { AdminDenied } from "@/components/admin-denied";

export const metadata: Metadata = {
  title: "Activity — Dollar Battleground",
};

export default async function AdminActivityPage() {
  const adminId = await requireAdmin();
  if (!adminId) return <AdminDenied />;
  return (
    <AdminShell title="ACTIVITY">
      <ActivityFeed />
    </AdminShell>
  );
}
