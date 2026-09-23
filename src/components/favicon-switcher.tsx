"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Swaps the browser-tab favicon to the player's faction color once they pick a
// side or return signed-in. Defaults to the split red/blue badge. Faction icons
// live at /icon-blue.png and /icon-red.png (in public/). The admin console
// always shows the split badge — the Commander has no side.

type Side = "red" | "blue" | null;

function iconFor(side: Side): string {
  return side === "red"
    ? "/icon-red.png"
    : side === "blue"
      ? "/icon-blue.png"
      : "/icon.png";
}

function setFavicon(side: Side) {
  const href = iconFor(side);
  let link = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][data-faction]',
  );
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.setAttribute("data-faction", "true");
    document.head.appendChild(link);
  }
  if (link.href !== new URL(href, location.origin).href) link.href = href;
}

function readSide(): Side {
  try {
    const p = JSON.parse(localStorage.getItem("bg_player_v1") || "{}");
    return p.side === "red" || p.side === "blue" ? p.side : null;
  } catch {
    return null;
  }
}

export function FaviconSwitcher() {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  useEffect(() => {
    const current = () => (isAdmin ? null : readSide());
    setFavicon(current());
    const onSide = (e: Event) => {
      const d = (e as CustomEvent<Side>).detail;
      setFavicon(isAdmin ? null : d === "red" || d === "blue" ? d : readSide());
    };
    const onFocus = () => setFavicon(current());
    window.addEventListener("bg:sidechange", onSide as EventListener);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("bg:sidechange", onSide as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAdmin]);
  return null;
}
