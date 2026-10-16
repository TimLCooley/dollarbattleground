// Little icons for Commander pieces (16×16 grid).
import type { Kind } from "@/lib/commander/engine";

const Svg = ({ children, title }: { children: React.ReactNode; title: string }) => (
  <svg viewBox="0 0 16 16" width="100%" height="100%" aria-label={title} role="img">
    {children}
  </svg>
);

export function TroopIcon({ kind }: { kind: Kind }) {
  if (kind === "soldier")
    return (
      <Svg title="Soldier">
        {/* sword */}
        <line x1="4.5" y1="11.5" x2="13" y2="3" stroke="#7f8a95" strokeWidth="3" strokeLinecap="square" />
        <line x1="13" y1="3" x2="10" y2="6" stroke="#c9d1d9" strokeWidth="1" />
        <line x1="2.5" y1="9" x2="7" y2="13.5" stroke="#8a5a2b" strokeWidth="2.6" strokeLinecap="square" />
        <line x1="2.5" y1="13.5" x2="4.5" y2="11.5" stroke="#5b3a1a" strokeWidth="2.6" strokeLinecap="square" />
      </Svg>
    );
  if (kind === "archer")
    return (
      <Svg title="Archer">
        {/* bow + arrow */}
        <path d="M6 1.5 Q 15 8 6 14.5" stroke="#8a5a2b" strokeWidth="2.6" fill="none" />
        <line x1="6" y1="1.5" x2="6" y2="14.5" stroke="#3a2410" strokeWidth="1" />
        <line x1="1.5" y1="8" x2="12" y2="8" stroke="#6b7079" strokeWidth="2" />
        <polygon points="15,8 11,5 11,11" fill="#6b7079" />
      </Svg>
    );
  return (
    <Svg title="Commander">
      {/* banner */}
      <rect x="2.5" y="1.5" width="2.4" height="13.5" fill="#5b3a1a" />
      <polygon points="4.9,1.5 15,4.5 4.9,8.5" fill="#f2c14e" stroke="#c9982f" strokeWidth="1" />
    </Svg>
  );
}
