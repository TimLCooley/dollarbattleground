"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Admin "view / play as": redeems a one-time sign-in made by the USERS tab
// and lands on the board as that player.
export default function SignInAs() {
  const [msg, setMsg] = useState("Signing in…");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const token_hash = q.get("token_hash");
    if (!token_hash) {
      setMsg("This link is missing its token.");
      return;
    }
    (async () => {
      const supabase = createClient();
      // Keep the admin's own session so "Back to admin" can restore it; sign
      // out locally only (a global sign-out would revoke it).
      const { data: cur } = await supabase.auth.getSession();
      if (cur.session && !localStorage.getItem("bg_admin_return")) {
        localStorage.setItem("bg_admin_return", JSON.stringify({ access_token: cur.session.access_token, refresh_token: cur.session.refresh_token }));
      }
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      try {
        localStorage.removeItem("bg_player_v1");
      } catch {
        /* ignore */
      }
      const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
      if (error || !data.user) {
        setMsg(`Couldn't sign in: ${error?.message ?? "unknown error"} (links work once and expire in an hour).`);
        return;
      }
      const { data: fc } = await supabase.from("free_claims").select("side").eq("user_id", data.user.id).maybeSingle();
      const side = (fc as { side?: string } | null)?.side;
      window.location.replace(side === "red" || side === "blue" ? `/${side}` : "/");
    })();
  }, []);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#155f33", color: "#f6efdb", fontFamily: "system-ui, sans-serif" }}>
      <p>{msg}</p>
    </main>
  );
}
