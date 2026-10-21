import type { Metadata } from "next";
import { sharedPath } from "@/lib/commander/share";

// Short link for "Share my path": commanderbg.com/s/<id>. Link previews read
// the title and the move-rows image here; people are sent straight on to the
// puzzle, where the plan unlocks once they've attacked.

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await sharedPath(id);
  const title = p ? `CommanderBG #${p.day} — a friend's battle plan` : "CommanderBG — a daily strategy puzzle";
  const description = "See how they played it — then try to beat it. A new strategy puzzle every day.";
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, url: `/s/${id}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedPath({ params }: Props) {
  const { id } = await params;
  const p = await sharedPath(id);
  const to = p ? `/?day=${p.day}&p=${id}&ref=share` : "/?ref=share";
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${to}`} />
      <script dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(to)})` }} />
      <p style={{ padding: 24, textAlign: "center" }}>
        <a href={to}>Open the puzzle →</a>
      </p>
    </>
  );
}
