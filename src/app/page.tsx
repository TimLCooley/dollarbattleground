import { createClient } from "@/utils/supabase/server";
import { Battleground, type Cell, type Faction } from "@/components/battleground";
import type { FeedItem } from "@/components/news-feed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();

  const [factionsRes, cellsRes, feedRes, userRes] = await Promise.all([
    supabase.from("factions").select("key,name,color").order("sort"),
    supabase.from("cells").select("x,y,faction_key"),
    supabase
      .from("feed")
      .select("id,text,color,created_at,kind")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.auth.getUser(),
  ]);

  let balance: number | null = null;
  const user = userRes.data.user;
  if (user) {
    const { data } = await supabase
      .from("wallets")
      .select("balance_credits")
      .eq("user_id", user.id)
      .maybeSingle();
    balance = data?.balance_credits ?? null;
  }

  return (
    <Battleground
      factions={(factionsRes.data ?? []) as Faction[]}
      initialCells={(cellsRes.data ?? []) as Cell[]}
      initialFeed={(feedRes.data ?? []) as FeedItem[]}
      initialBalance={balance}
    />
  );
}
