const SEAM_LEFT =
  "0,0 200,0 197,60 204,130 196,210 205,290 197,370 203,460 196,540 204,620 197,710 200,800 0,800";
const SEAM_RIGHT =
  "200,0 400,0 400,800 200,800 197,710 204,620 196,540 203,460 197,370 205,290 196,210 204,130 197,60";
const SEAM_LINE =
  "200,0 197,60 204,130 196,210 205,290 197,370 203,460 196,540 204,620 197,710 200,800";

function buildRays(): string[] {
  const cx = 200;
  const cy = 880;
  const r = 1300;
  const count = 14;
  const rays: string[] = [];
  for (let i = 0; i < count; i++) {
    const a1 = -Math.PI / 2 - Math.PI / 2.4 + (i / count) * (Math.PI / 1.2);
    const widthRad = 0.04 + (i % 2) * 0.015;
    const x1 = cx + Math.cos(a1 - widthRad) * r;
    const y1 = cy + Math.sin(a1 - widthRad) * r;
    const x2 = cx + Math.cos(a1 + widthRad) * r;
    const y2 = cy + Math.sin(a1 + widthRad) * r;
    rays.push(`${cx},${cy} ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
  }
  return rays;
}

export function HalftoneBackdrop() {
  const rays = buildRays();
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      viewBox="0 0 400 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="dots-fine" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1" fill="currentColor" />
        </pattern>
        <pattern id="dots-bold" width="11" height="11" patternUnits="userSpaceOnUse">
          <circle cx="5.5" cy="5.5" r="3.4" fill="currentColor" />
        </pattern>
        <radialGradient id="seam-glow" cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="55%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="rays-mask">
          <rect width="400" height="800" fill="black" />
          {rays.map((points, i) => (
            <polygon key={i} points={points} fill="url(#seam-glow)" />
          ))}
        </mask>
        <mask id="vignette">
          <rect width="400" height="800" fill="white" />
          <rect width="400" height="50" fill="url(#fade-top)" />
          <rect y="650" width="400" height="150" fill="url(#fade-bot)" />
        </mask>
        <linearGradient id="fade-top" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="black" />
          <stop offset="100%" stopColor="white" />
        </linearGradient>
        <linearGradient id="fade-bot" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" stopOpacity="0.4" />
        </linearGradient>
        <clipPath id="left-half" clipPathUnits="userSpaceOnUse">
          <polygon points={SEAM_LEFT} />
        </clipPath>
        <clipPath id="right-half" clipPathUnits="userSpaceOnUse">
          <polygon points={SEAM_RIGHT} />
        </clipPath>
      </defs>

      <g clipPath="url(#left-half)">
        <rect width="400" height="800" fill="#0B0B0C" />
        <g color="#B0121A">
          <rect width="400" height="800" fill="url(#dots-fine)" opacity="0.32" mask="url(#vignette)" />
          <rect width="400" height="800" fill="url(#dots-bold)" mask="url(#rays-mask)" opacity="0.85" />
        </g>
      </g>

      <g clipPath="url(#right-half)">
        <rect width="400" height="800" fill="#0B0B0C" />
        <g color="#0E2A52">
          <rect width="400" height="800" fill="url(#dots-fine)" opacity="0.42" mask="url(#vignette)" />
          <rect width="400" height="800" fill="url(#dots-bold)" mask="url(#rays-mask)" opacity="0.95" />
        </g>
      </g>

      <polyline
        points={SEAM_LINE}
        fill="none"
        stroke="#F4EFE6"
        strokeWidth="0.6"
        strokeOpacity="0.42"
      />
      <polyline
        points={SEAM_LINE}
        fill="none"
        stroke="#F4EFE6"
        strokeWidth="2"
        strokeOpacity="0.05"
      />
    </svg>
  );
}
