import { signInAsGuest } from "@/app/actions/auth";

export function GuestCTA() {
  return (
    <form action={signInAsGuest}>
      <button
        type="submit"
        className="enlist-btn relative block w-full border-2 border-bone bg-ink py-5 font-display text-[1.65rem] font-black uppercase tracking-[0.18em] text-bone transition-transform duration-75 active:translate-x-[3px] active:translate-y-[3px] sm:text-3xl"
      >
        <span className="relative z-10">Enlist as Guest</span>
      </button>
    </form>
  );
}
