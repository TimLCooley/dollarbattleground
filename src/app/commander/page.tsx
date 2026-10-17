import { redirect } from "next/navigation";

// Commander moved to the home page; old /commander links (and ?day=) still work.
export default async function CommanderRedirect({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(qs ? `/?${qs}` : "/");
}
