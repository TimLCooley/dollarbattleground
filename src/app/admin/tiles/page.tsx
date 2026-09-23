import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin-shell";
import { AdminTiles } from "@/components/admin-tiles";
import { AdminDenied } from "@/components/admin-denied";

export const metadata: Metadata = {
  title: "Tile Log — Dollar Battleground",
};

export default async function AdminTilesPage() {
  const adminId = await requireAdmin();
  if (!adminId) return <AdminDenied />;
  return (
    <AdminShell title="TILE LOG">
      <AdminTiles />
    </AdminShell>
  );
}
