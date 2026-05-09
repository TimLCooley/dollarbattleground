"use client";

import { signOut } from "@/app/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="border-2 border-bone/40 px-6 py-3 font-mono text-sm tracking-[0.2em] text-bone/80 transition-colors hover:border-bone hover:text-bone"
      >
        STAND DOWN
      </button>
    </form>
  );
}
