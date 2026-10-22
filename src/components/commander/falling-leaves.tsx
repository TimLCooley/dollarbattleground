// Seasonal weather: autumn leaves (Thanksgiving) or snow (Holiday) drifting
// down the screen. Pure CSS, never in the way (pointer-events: none), and off
// for anyone who prefers less motion.

const COLORS = ["#d9822b", "#b5402a", "#e8b53a", "#a8481f", "#c96a24"];

export function FallingLeaves({ count = 14, snow = false }: { count?: number; snow?: boolean }) {
  return (
    <div className="cm-leaves" aria-hidden>
      {Array.from({ length: count }, (_, k) => {
        // deterministic spread: position, size, speed and start time per leaf
        const left = (k * 37) % 100;
        const size = snow ? 5 + ((k * 13) % 7) : 14 + ((k * 13) % 12);
        const fall = 9 + ((k * 7) % 8);
        const delay = -((k * 23) % 17);
        const sway = 2.4 + ((k * 5) % 3) * 0.6;
        return (
          <span
            key={k}
            className={"cm-leaf" + (snow ? " snow" : "")}
            style={{ left: `${left}%`, width: size, height: size, animationDuration: `${fall}s`, animationDelay: `${delay}s` }}
          >
            <svg viewBox="0 0 20 20" style={{ animationDuration: `${sway}s`, animationDelay: `${delay / 3}s` }}>
              {snow ? (
                <circle cx="10" cy="10" r="9" fill="rgba(255,255,255,0.9)" />
              ) : (
                <>
                  <path d="M10 1 C15 5 18 9 10 19 C2 9 5 5 10 1 Z" fill={COLORS[k % COLORS.length]} />
                  <path d="M10 3 V18" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
                </>
              )}
            </svg>
          </span>
        );
      })}
    </div>
  );
}
