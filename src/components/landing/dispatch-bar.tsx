export function DispatchBar({ date }: { date: string }) {
  return (
    <header className="relative z-20 border-b border-bone/15 bg-ink/80 backdrop-blur-[2px]">
      <div className="flex items-center justify-between px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.32em] text-bone/65 sm:text-[11px]">
        <span className="flex items-center gap-2">
          <span aria-hidden className="block size-1.5 bg-crimson" />
          Dispatch
          <span aria-hidden className="block size-1.5 bg-navy" />
        </span>
        <span className="tabular-nums">{date}</span>
      </div>
    </header>
  );
}
