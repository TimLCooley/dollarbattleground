import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

// app_config is a key/value table whose value column is TEXT. JSON goes in and
// out as a string — every reader and writer goes through here so nobody forgets.

export type Db = ReturnType<typeof createAdminClient>;

export async function cfgGet<T>(db: Db, key: string): Promise<T | null> {
  const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
  const raw = (data as { value?: string } | null)?.value;
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cfgSet(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .from("app_config")
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: "key" });
}
