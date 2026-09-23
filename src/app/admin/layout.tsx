import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminDenied } from "@/components/admin-denied";

// Every /admin route is gated here, server-side, before any client page
// renders — the pre-launch middleware used to do this by accident.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const adminId = await requireAdmin();
  if (!adminId) return <AdminDenied />;
  return <>{children}</>;
}
