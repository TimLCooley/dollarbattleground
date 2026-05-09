export function StampHeadline({ word }: { word: string }) {
  return (
    <h1
      className="stamp font-display text-[clamp(3.4rem,15.5vw,6.25rem)] font-black uppercase leading-[0.82] tracking-[-0.025em] text-bone"
      aria-label={word}
    >
      {word}
    </h1>
  );
}
