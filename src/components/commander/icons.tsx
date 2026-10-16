// Little icons for Commander pieces (16×16 grid).
import type { Kind, PickupKind } from "@/lib/commander/engine";

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
  if (kind === "ranged")
    return (
      <Svg title="Ranged">
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

export function FortIcon() {
  return (
    <Svg title="Fort">
      <rect x="2" y="6" width="12" height="8" fill="#6b6f76" />
      <rect x="2" y="4" width="2" height="2" fill="#6b6f76" />
      <rect x="7" y="4" width="2" height="2" fill="#6b6f76" />
      <rect x="12" y="4" width="2" height="2" fill="#6b6f76" />
      <rect x="6" y="10" width="4" height="4" fill="#2b2d31" />
      <rect x="2" y="6" width="12" height="1" fill="#8d929a" />
    </Svg>
  );
}

export function PickupIcon({ kind }: { kind: PickupKind }) {
  if (kind === "crate")
    return (
      <Svg title="Supply crate +3">
        <rect x="3" y="4" width="10" height="9" fill="#b07a3c" />
        <rect x="3" y="4" width="10" height="1" fill="#d39b57" />
        <rect x="3" y="8" width="10" height="1" fill="#7c5326" />
        <rect x="7" y="4" width="2" height="9" fill="#7c5326" />
      </Svg>
    );
  if (kind === "gold")
    return (
      <Svg title="Gold +10">
        <rect x="5" y="3" width="6" height="10" fill="#f2c14e" />
        <rect x="3" y="5" width="10" height="6" fill="#f2c14e" />
        <rect x="7" y="5" width="2" height="6" fill="#c9982f" />
        <rect x="5" y="4" width="2" height="1" fill="#fff3c4" />
      </Svg>
    );
  return (
    <Svg title="Mine −5">
      <rect x="4" y="5" width="8" height="8" fill="#2b2d31" />
      <rect x="5" y="4" width="6" height="10" fill="#2b2d31" />
      <rect x="7" y="2" width="2" height="2" fill="#8d929a" />
      <rect x="6" y="6" width="2" height="2" fill="#5d6168" />
      <rect x="9" y="1" width="2" height="2" fill="#d23b3b" />
    </Svg>
  );
}
