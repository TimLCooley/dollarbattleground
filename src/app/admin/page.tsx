import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin-shell";
import { AdminPanel } from "@/components/admin-panel";
import { AdminShow } from "@/components/admin-show";
import { AdminDenied } from "@/components/admin-denied";

export const metadata: Metadata = {
  title: "Roster — Dollar Battleground",
};

export default async function AdminPage() {
  const adminId = await requireAdmin();
  if (!adminId) return <AdminDenied />;
  return (
    <AdminShell title="ROSTER">
      <AdminShow />
      <AdminPanel />
    </AdminShell>
  );
}
