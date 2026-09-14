// Admin identity, shared by client and server (no "server-only" here).

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
