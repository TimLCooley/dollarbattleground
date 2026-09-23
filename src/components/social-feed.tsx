/* eslint-disable @next/next/no-img-element */
"use client";

// Read-only, X-style faction feeds for /both — now reflecting what the Recruiter
// has ACTUALLY posted (from /api/social-feed). Blue left, Red right.

import { useEffect, useState } from "react";

type Side = "red" | "blue";

interface Post {
  id: number;
  body: string;
  postedAt: string | null;
  externalId: string | null;
}

const META: Record<Side, { name: string; handle: string }> = {
  blue: { name: "Blue Command", handle: "@BluBattleGround" },
  red: { name: "Red Command", handle: "@RedBattleGround" },
};

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function SocialFeed({ side, posts }: { side: Side; posts: Post[] }) {
  const cfg = META[side];
  const icon = `/icon-${side}.png`;
  return (
    <section className="xfeed" data-side={side} aria-label={`${cfg.name} feed`}>
      <header className="xfeed-head">
        <img className="xfeed-ava" src={icon} alt="" />
        <div className="xfeed-id">
          <span className="xfeed-name">{cfg.name}</span>
          <span className="xhandle">{cfg.handle}</span>
        </div>
        <span className="xfeed-live">
          <span className="xfeed-dot" /> LIVE
        </span>
      </header>
      {posts.length === 0 ? (
        <p className="xempty">No dispatches yet — the war room is warming up.</p>
      ) : (
        posts.map((p) => (
          <article className="xpost" key={p.id}>
            <img className="xav xav-img" src={icon} alt="" />
            <div className="xmain">
              <div className="xhead">
                <span className="xname">{cfg.name}</span>
                <span className="xbadge" title="Verified" aria-label="Verified">✓</span>
                <span className="xhandle">{cfg.handle}</span>
                <span className="xhandle">·</span>
                <span className="xtime">{ago(p.postedAt)}</span>
              </div>
              <p className="xbody">{p.body}</p>
              {p.externalId && (
                <a
                  className="xlink"
                  href={`https://x.com/i/status/${p.externalId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗ View on X
                </a>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}

export function SocialFeeds() {
  const [feed, setFeed] = useState<{ red: Post[]; blue: Post[] }>({ red: [], blue: [] });
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/social-feed")
        .then((r) => r.json())
        .then((d) => alive && setFeed({ red: d.red ?? [], blue: d.blue ?? [] }))
        .catch(() => {});
    load();
    const t = setInterval(load, 30000); // refresh so new posts appear
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <div className="feeds-split">
      <SocialFeed side="blue" posts={feed.blue} />
      <SocialFeed side="red" posts={feed.red} />
    </div>
  );
}
