import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminPanel } from "@/components/admin-panel";

export const metadata: Metadata = {
  title: "Command — Dollar Battleground",
};

export default async function AdminPage() {
  const adminId = await requireAdmin();
  if (!adminId) {
    return (
      <div className="adm-denied">
        <div className="adm-denied-kicker">◆ RESTRICTED ◆</div>
        <h1>ACCESS DENIED</h1>
        <p>This sector is command-only. Log in as an authorized officer.</p>
        <Link href="/" className="adm-denied-link">
          ‹ Return to the board
        </Link>
      </div>
    );
  }
  return <AdminPanel />;
}
