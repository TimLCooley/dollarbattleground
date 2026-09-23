"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isAdminUser } from "@/lib/admin-shared";

// Admin "Free Play" toggle: when on, the board paints free (no purchase pop-up)
// for admins only. Persisted in localStorage, synced across board views via a
// window event. Default ON so admins aren't charged while testing.
const KEY = "bg_admin_freeplay";

export function useAdminFreePlay() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [flag, setFlag] = useState(true);

  useEffect(() => {
    let alive = true;
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (alive && user) setIsAdmin(isAdminUser(user));
      });
    try {
      const v = localStorage.getItem(KEY);
      if (v !== null) setFlag(v === "1");
    } catch {
      /* ignore */
    }
    const onEvt = () => {
      try {
        setFlag(localStorage.getItem(KEY) !== "0");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("bg:freeplay", onEvt);
    return () => {
      alive = false;
      window.removeEventListener("bg:freeplay", onEvt);
    };
  }, []);

  const toggle = useCallback(() => {
    setFlag((f) => {
      const next = !f;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("bg:freeplay"));
      return next;
    });
  }, []);

  return { isAdmin, freePlay: isAdmin && flag, flagOn: flag, toggle };
}
