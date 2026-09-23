"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The admin sections are real routes now, so each is bookmarkable and the
// browser back/forward buttons page between them.
const TABS = [
  { href: "/admin", label: "ROSTER" },
  { href: "/admin/tiles", label: "TILE LOG" },
  { href: "/admin/agents", label: "AGENTS" },
  { href: "/admin/calendar", label: "CALENDAR" },
  { href: "/admin/activity", label: "ACTIVITY" },
  { href: "/admin/fx", label: "FX" },
];

export function AdminShell({
  title = "COMMAND",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const path = usePathname();
  return (
    <div className="adm">
      <header className="adm-head">
        <div className="adm-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="adm-logo" src="/logo.png" alt="Battleground" />
          <div>
            <div className="adm-kicker">◆ COMMAND CONSOLE ◆</div>
            <h1 className="adm-title">
              <span className="adm-coin">$</span> {title}
            </h1>
          </div>
        </div>
        <Link href="/" className="adm-exit">
          ‹ BOARD
        </Link>
      </header>

      <nav className="adm-tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={path === t.href ? "on" : ""}>
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
