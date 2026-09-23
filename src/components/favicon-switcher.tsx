"use client";

import { useEffect } from "react";

// Swaps the browser-tab favicon to the player's faction color once they pick a
// side or return signed-in. Defaults to the split red/blue badge. Faction icons
// live at /icon-blue.png and /icon-red.png (in public/).

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
  useEffect(() => {
    setFavicon(readSide());
    const onSide = (e: Event) => {
      const d = (e as CustomEvent<Side>).detail;
      setFavicon(d === "red" || d === "blue" ? d : readSide());
    };
    const onFocus = () => setFavicon(readSide());
    window.addEventListener("bg:sidechange", onSide as EventListener);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("bg:sidechange", onSide as EventListener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return null;
}
