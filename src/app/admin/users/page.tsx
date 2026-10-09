import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin-shell";
import { AdminUsers } from "@/components/admin-users";
import { AdminDenied } from "@/components/admin-denied";

export const metadata: Metadata = {
  title: "Users — Dollar Battleground",
};

export default async function AdminUsersPage() {
  const adminId = await requireAdmin();
  if (!adminId) return <AdminDenied />;
  return (
    <AdminShell title="USERS">
      <AdminUsers />
    </AdminShell>
  );
}
