import type { Metadata } from "next";

// Short link for "Share score": commanderbg.com/d/<day> → that day's puzzle.
// The preview is the normal CommanderBG card (inherited from the root layout).

type Props = { params: Promise<{ day: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  const title = /^\d+$/.test(day) ? `CommanderBG #${day} — can you beat my score?` : "CommanderBG — a daily strategy puzzle";
  return { title, robots: { index: false }, openGraph: { title, url: `/d/${day}` }, twitter: { card: "summary_large_image", title } };
}

export default async function SharedDay({ params }: Props) {
  const { day } = await params;
  const to = /^\d+$/.test(day) ? `/?day=${day}&ref=share` : "/?ref=share";
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
