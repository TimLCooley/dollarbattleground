import { DispatchBar } from "@/components/landing/dispatch-bar";
import { FallingSquares } from "@/components/landing/falling-squares";
import { GuestCTA } from "@/components/landing/guest-cta";
import { HalftoneBackdrop } from "@/components/landing/halftone-backdrop";
import { StampHeadline } from "@/components/landing/stamp-headline";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function dispatchDate(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Home() {
  const today = dispatchDate();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <DispatchBar date={today} />

      <main className="relative isolate flex flex-1 flex-col">
        <HalftoneBackdrop />
        <FallingSquares />
        <div aria-hidden className="grain pointer-events-none absolute inset-0" />

        <div className="relative z-10 flex flex-1 flex-col justify-between px-6 pb-10 pt-14 sm:px-10 sm:pb-16 sm:pt-20">
          <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.5em] text-bone/55">
              Vol. I &nbsp;·&nbsp; No. 0001
            </span>

            <div className="mt-5">
              <StampHeadline word="BATTLEGROUND" />
            </div>

            <p className="mt-7 max-w-[19ch] text-balance font-body text-lg leading-snug text-bone/85 sm:text-xl">
              One dollar. One square.{" "}
              <span className="block font-bold italic text-bone">Two Americas.</span>
            </p>

            <div className="mt-9 grid w-full max-w-[18rem] grid-cols-[1fr_auto_1fr] items-end gap-5 text-bone">
              <div className="flex flex-col items-end gap-1.5">
                <span aria-hidden className="block h-[3px] w-9 bg-crimson" />
                <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-bone/70">
                  Red
                </span>
                <span className="font-display text-4xl font-black leading-none tabular-nums">
                  0
                </span>
              </div>
              <span aria-hidden className="tally-rule block h-14 w-px" />
              <div className="flex flex-col items-start gap-1.5">
                <span aria-hidden className="block h-[3px] w-9 bg-navy" />
                <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-bone/70">
                  Blue
                </span>
                <span className="font-display text-4xl font-black leading-none tabular-nums">
                  0
                </span>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-12 w-full max-w-md">
            <GuestCTA />
            <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-bone/55">
              No email required. You can claim a side later.
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-bone/10 bg-ink/85 px-6 py-3 text-center font-mono text-[10px] italic tracking-wider text-bone/45">
        Paid for by no one. Yet.
      </footer>
    </div>
  );
}
