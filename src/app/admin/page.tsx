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
        <div className="ts-stamp">TOP SECRET</div>
        <div className="adm-denied-kicker">◆ CLEARANCE REQUIRED ◆</div>
        <h1>ACCESS DENIED</h1>
        <p>
          This file is above your pay grade, soldier. Command personnel only —
          log in with authorized credentials.
        </p>
        <Link href="/" className="adm-denied-link">
          ‹ Return to the board
        </Link>
      </div>
    );
  }
  return <AdminPanel />;
}
