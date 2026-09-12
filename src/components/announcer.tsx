"use client";

// Top status bar: live tile counts, with event flashes (threats/promotions)
// briefly taking over the whole bar.
export function Announcer({
  counts,
  threat,
}: {
  counts: { b: number; r: number; n: number };
  playerSide?: unknown; // (unused; kept for call-site compatibility)
  threat?: string | null;
}) {
  if (threat) {
    return (
      <div className="statusbar alert" role="status">
        <span className="sb-dot" aria-hidden="true" />
        <span className="sb-flash" key={threat}>
          {threat}
        </span>
      </div>
    );
  }
  return (
    <div className="statusbar" role="status">
      <span className="sb-seg">
        <span className="sb-swatch blue" aria-hidden="true" />
        BLUE COMMANDS {counts.b}
      </span>
      <span className="sb-div" aria-hidden="true" />
      <span className="sb-seg">
        <span className="sb-swatch red" aria-hidden="true" />
        RED COMMANDS {counts.r}
      </span>
      <span className="sb-div" aria-hidden="true" />
      <span className="sb-seg">{counts.n} OPEN</span>
      <span className="sb-arrows" aria-hidden="true">
        ›››
      </span>
    </div>
  );
}
