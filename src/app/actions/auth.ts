"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function signInAsGuest(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously();

  if (error) {
    redirect("/?error=auth");
  }

  revalidatePath("/", "layout");
  redirect("/play");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/");
}
