import { redirect } from "next/navigation";

// The map is live (2026-09-23). The pre-launch Coming Soon / waitlist screen
// is retired; anyone landing here goes straight to the board. Old links that
// carried a side keep it: /coming-soon?side=blue → /blue.
export default async function ComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const side = q.side === "red" || q.side === "blue" ? q.side : null;
  redirect(side ? `/${side}` : "/");
}
