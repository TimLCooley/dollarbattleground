import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin-shell";
import { SocialCalendar } from "@/components/social-calendar";
import { AdminDenied } from "@/components/admin-denied";

export const metadata: Metadata = {
  title: "Calendar — Dollar Battleground",
};

export default async function AdminCalendarPage() {
  const adminId = await requireAdmin();
  if (!adminId) return <AdminDenied />;
  return (
    <AdminShell title="CALENDAR">
      <SocialCalendar />
    </AdminShell>
  );
}
