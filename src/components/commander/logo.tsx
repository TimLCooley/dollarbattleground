// The COMMANDER wordmark in the player's color (blue by default).
export function CommanderLogo({ side, className = "cm-logo" }: { side?: "red" | "blue" | null; className?: string }) {
  const c = side === "red" ? "red" : "blue";
  return (
    <picture>
      <source srcSet={`/commander-logo-${c}.webp`} type="image/webp" />
      <img className={className} src={`/commander-logo-${c}.png`} alt="CommanderBG" width={1200} height={c === "red" ? 256 : 259} />
    </picture>
  );
}
