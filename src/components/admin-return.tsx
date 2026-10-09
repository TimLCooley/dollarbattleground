"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Shown while the admin is playing as someone (USERS → eye): one tap puts the
// admin's own session back and returns to the USERS tab.
export function AdminReturn() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(!!localStorage.getItem("bg_admin_return"));
    } catch {
      /* ignore */
    }
  }, []);
  if (!on) return null;
  async function back() {
    try {
      const saved = JSON.parse(localStorage.getItem("bg_admin_return") || "null");
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      localStorage.removeItem("bg_admin_return");
      localStorage.removeItem("bg_player_v1");
      if (saved?.refresh_token) await supabase.auth.setSession(saved);
    } catch {
      /* fall through to sign-in */
    }
    window.location.href = "/admin/users";
  }
  return (
    <button className="admin-return" onClick={back} type="button">
      ← Back to admin
    </button>
  );
}
