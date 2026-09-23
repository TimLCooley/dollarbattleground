import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin-shell";
import { CommandCenter } from "@/components/command-center";
import { AdminDenied } from "@/components/admin-denied";

export const metadata: Metadata = {
  title: "Agents — Dollar Battleground",
};

export default async function AdminAgentsPage() {
  const adminId = await requireAdmin();
  if (!adminId) return <AdminDenied />;
  return (
    <AdminShell title="AGENTS">
      <CommandCenter />
    </AdminShell>
  );
}
