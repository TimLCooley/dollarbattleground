"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// Admin "view / play as": redeems a one-time sign-in made by the USERS tab
// and lands on the board as that player.
export default function SignInAs() {
  const [msg, setMsg] = useState("Signing in…");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let token_hash = q.get("token_hash");
    const email = q.get("email");
    if (!token_hash && !email) {
      setMsg("This link is missing who to sign in as.");
      return;
    }
    (async () => {
      if (!token_hash && email) {
        setMsg(`Getting a sign-in for ${email}…`);
        const r = await fetch("/api/admin/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "impersonate", email }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.url) {
          setMsg(r.status === 403 ? "You're not signed in as the admin in this browser — sign in at /admin first (or tap Back to admin)." : `Couldn't get a sign-in: ${d.error ?? r.status}`);
          return;
        }
        token_hash = new URL(d.url).searchParams.get("token_hash");
      }
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
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: token_hash!, type: "magiclink" });
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
