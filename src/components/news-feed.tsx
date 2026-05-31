export type FeedItem = {
  id: number;
  text: string;
  color?: string | null;
  created_at: string;
  kind?: string;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NewsFeed({ items }: { items: FeedItem[] }) {
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-neutral-200">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur">
        <h2 className="text-lg font-bold">Updates</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-400">
            No updates yet. Claim a square to get things started.
          </p>
        ) : (
          items.map((it) => (
            <article
              key={it.id}
              className="flex gap-3 border-b border-neutral-100 px-4 py-3"
            >
              <div
                className="h-10 w-10 shrink-0 rounded-full border border-neutral-200 bg-neutral-200"
                style={it.color ? { backgroundColor: it.color } : undefined}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-1 text-sm">
                  <span className="font-semibold">Dollar Battleground</span>
                  <span className="text-neutral-500" suppressHydrationWarning>
                    @battleground · {fmtTime(it.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-neutral-800">{it.text}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
