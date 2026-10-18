// Server-rendered "about" text under the game: the game itself draws in the
// browser, so this is what search engines and AI assistants can actually read.
// Mirrors the FAQ in the JSON-LD below.
const FAQ: [string, string][] = [
  ["Is Commander free?", "Yes. Commander is free to play in your browser — no download, no account needed to play. An account (just an email) lets you post your score."],
  ["How often is there a new puzzle?", "Every day at midnight Mountain Time. Everyone gets the same map, so you can compare scores."],
  ["How hard is it?", "It follows the week: Monday is the easiest, Friday and Saturday are the hardest, Sunday is in the middle."],
  ["How do you play?", "Your Commander holds the 3×3 around it. Place Archers (they take 3 squares left and right, flying over walls and water but stopped by trees) and Soldiers (they take 2 squares up and down, walking through trees and wading water but stopped by walls). Troops can only stand on ground you already hold, so the order matters. Take as many squares as you can."],
  ["Can I practice before submitting?", "Yes — practice as much as you like and your best layout is saved. Only your Attack counts, and after it you can see the best possible layout."],
  ["What is the Battleground?", "The Battleground is CommanderBG's other mode: Red vs Blue on one live map where every player helps their side hold more ground. Good Commander scores earn free squares there."],
];

export function AboutCommander() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "CommanderBG", url: "https://commanderbg.com" },
      {
        "@type": "VideoGame",
        name: "Commander",
        url: "https://commanderbg.com",
        description: "A free daily strategy puzzle: place Archers and Soldiers to take the most ground. A new map every day, the same for everyone.",
        genre: ["Puzzle", "Strategy"],
        gamePlatform: "Web browser",
        applicationCategory: "Game",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@type": "Organization", name: "CommanderBG" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
  return (
    <section className="seo-about" aria-labelledby="about-commander">
      <h2 id="about-commander">Commander — a free daily strategy puzzle</h2>
      <p>
        Commander is a daily strategy puzzle game on CommanderBG. Every day there&apos;s a new map — the same one for everyone. You place a
        few Archers and Soldiers to take as much ground as you can, and the order you place them is the whole puzzle. Practice as much as
        you like; one shot counts.
      </p>
      <h3>Questions</h3>
      <dl>
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <dt>{q}</dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
      <p>
        New here? Try the <a href="/commander/tutorial">2-minute tutorial</a> or the <a href="/battleground">Battleground</a>.
      </p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </section>
  );
}
