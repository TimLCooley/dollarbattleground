import "server-only";
import { createClient } from "@/utils/supabase/server";

// The super admin. Anyone signed in with this email is an admin; additional
// admins can be granted via the auth user's app_metadata.is_admin flag.
export const SUPER_ADMIN_EMAIL = "timlcooley@gmail.com";

export function isAdminUser(user: {
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
}): boolean {
  return (
    user.email?.toLowerCase() === SUPER_ADMIN_EMAIL ||
    user.app_metadata?.is_admin === true
  );
}

// Returns the admin's user id if the current request is from a signed-in admin,
// else null.
export async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return isAdminUser(user) ? user.id : null;
}
