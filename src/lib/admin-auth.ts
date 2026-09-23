import "server-only";
import { createClient } from "@/utils/supabase/server";

export { SUPER_ADMIN_EMAIL, isAdminUser } from "./admin-shared";
import { isAdminUser } from "./admin-shared";

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
