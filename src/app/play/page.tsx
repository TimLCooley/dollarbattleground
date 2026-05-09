import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { SignOutButton } from "./sign-out-button";

export const metadata = {
  title: "Standing By — Political Battleground",
};

export default async function PlayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-ink px-6 py-16 text-bone">
      <div className="absolute right-6 top-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/60">
        <span className="block size-2 animate-pulse rounded-none bg-crimson" />
        Live
      </div>

      <div className="w-full max-w-md border-2 border-bone/20 p-8 sm:p-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-bone/50">
          Incoming Transmission
        </p>
        <h1 className="mt-6 font-display text-5xl uppercase leading-[0.9] tracking-tight sm:text-6xl">
          You&apos;re in.
        </h1>
        <p className="mt-6 font-mono text-sm leading-relaxed text-bone/75">
          The war begins soon. Stand by for orders.
        </p>

        <div className="mt-10 border-t border-bone/15 pt-8">
          <SignOutButton />
        </div>
      </div>

      <p className="absolute bottom-6 font-mono text-[10px] italic tracking-wider text-bone/40">
        Paid for by no one. Yet.
      </p>
    </main>
  );
}
