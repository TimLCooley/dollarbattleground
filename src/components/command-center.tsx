"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartButton, GateButton, StripeToggle, TikTokButton } from "@/components/stripe-ops";

// The command center, full width: RED on the left, BLUE on the right, COMMAND
// in the middle. Each team column is that side's queue (draft / posted /
// denied) plus a chat with its agents; the middle holds the Commander's notes,
// the General's orders, Intel, and a chat with the General, Intel Ops, or
// BOTH Social agents at once. An empty DRAFT column drafts itself.

type Faction = "red" | "blue";
type Status = "queued" | "posted" | "denied";

interface Post {
  id: number;
  faction: Faction | "founder" | null;
  status: string;
  format: string;
  angle: string | null;
  x_account: string | null;
  copy: string;
  video_kind: string | null;
  media_url: string | null;
  reason: string | null;
  deny_reason: string | null;
  external_id: string | null;
  replaces: number | null;
  scheduled_for: string | null;
  last_error: string | null;
  created_at: string;
  impressions: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  clicks: number | null;
  metrics_at: string | null;
}
interface Msg {
  id?: number;
  role: string;
  content: string;
  created_at?: string;
  faction?: Faction; // set in the BOTH view
}
interface Campaign {
  endsAt: string | null;
  daysLeft: number | null;
  goalUsd: number;
}
interface XStatus {
  ok: boolean;
  handle?: string;
  name?: string;
  error?: string;
}
interface Autopilot {
  config: { enabled: boolean; review_minutes: number; posts_per_day_per_team: number };
  state: { last_run_at?: string; last_result?: string };
  stripeMode: "test" | "live";
}
interface Orders {
  recruit_pct: number;
  directives: string[];
  red_focus: string;
  blue_focus: string;
  rationale: string;
  updated_at: string;
  by: string;
  pct_locked_by_commander: boolean;
}
interface Brief {
  campaign: { goal: number; perTeam: number; redRecruits: number; blueRecruits: number; daysLeft: number } | null;
  board: { red: number; blue: number; flips24h: number; toRed24h: number; toBlue24h: number };
  funnel: {
    waitlistTotal: number;
    waitlist24h: number;
    players: number;
    active24h: number;
    spentTotalCents: number;
    signups7d: number;
    purchases7d: number;
    revenue7dCents: number;
    takeoverEmails7d: number;
    winbacks7d: number;
  };
  social: { posted: number; queued: number; impressions: number; engagements: number; clicks: number };
  text: string; // the brief exactly as the agents receive it
  at: string;
}
interface Gen {
  orders: Orders;
  brief: Brief;
  notes: string;
}

const TEAM_AGENTS: Record<Faction, { key: string; label: string }[]> = {
  red: [
    { key: "red_recruiter", label: "📣 Red Social" },
    { key: "red_anchor", label: "🎙️ Sienna Cole" },
    { key: "red_field", label: "📡 Rowan Cross" },
  ],
  blue: [
    { key: "blue_recruiter", label: "📣 Blue Social" },
    { key: "blue_anchor", label: "🎙️ Sterling Wells" },
    { key: "blue_field", label: "📡 Skye Bennett" },
  ],
};
const NAME: Record<Faction, string> = { red: "RED", blue: "BLUE" };
const DOT: Record<Faction, string> = { red: "🔴", blue: "🔵" };

const themeOf = (r: string | null) => r?.match(/\[theme:(\w+)\]/)?.[1] ?? null;
const cleanReason = (r: string | null) => (r ?? "").replace(/\[theme:\w+\]\s*/, "");

// ── chat ────────────────────────────────────────────────────────────────────
// One box, three modes: a single agent, or BOTH Social agents (same message to
// each, replies tagged by side).
function ChatBox({ target, placeholder }: { target: string | "both"; placeholder: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (target === "both") {
      const [r, b] = await Promise.all([fetch("/api/admin/agent-chat?agent=red_recruiter"), fetch("/api/admin/agent-chat?agent=blue_recruiter")]);
      const rm = (r.ok ? (await r.json()).messages : []) as Msg[];
      const bm = (b.ok ? (await b.json()).messages : []) as Msg[];
      const all = [...rm.map((m) => ({ ...m, faction: "red" as Faction })), ...bm.map((m) => ({ ...m, faction: "blue" as Faction }))];
      all.sort((x, y) => (x.created_at ?? "").localeCompare(y.created_at ?? ""));
      setMsgs(all);
    } else {
      const r = await fetch(`/api/admin/agent-chat?agent=${target}`);
      setMsgs(r.ok ? (await r.json()).messages : []);
    }
  }, [target]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const keys = target === "both" ? ["red_recruiter", "blue_recruiter"] : [target];
    setMsgs((m) => [...m, { role: "commander", content: text }]);
    try {
      for (const k of keys) {
        const res = await fetch("/api/admin/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentKey: k, message: text }),
        });
        const d = await res.json();
        setMsgs((m) => [...m, { role: "agent", content: d.reply ?? d.error ?? "…", faction: k.startsWith("blue") ? "blue" : "red" }]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-chat">
      <div className="cc-chat-log">
        {msgs.length === 0 && <p className="cc-empty">Coach them, ask for a plan, give an order.</p>}
        {msgs.map((m, i) => (
          <div key={m.id ?? `${i}-${m.role}`} className={"cc-msg " + m.role} data-faction={m.faction ?? ""}>
            {target === "both" && m.role === "agent" && m.faction ? `${DOT[m.faction]} ` : ""}
            {m.content}
          </div>
        ))}
        {busy && <div className="cc-msg agent cc-typing">…</div>}
        <div ref={end} />
      </div>
      <div className="cc-chat-in">
        <textarea
          rows={2}
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="cc-btn" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

// ── the page ────────────────────────────────────────────────────────────────
export function CommandCenter() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [filter, setFilter] = useState<Record<Faction, Status>>({ red: "queued", blue: "queued" });
  const [chatTarget, setChatTarget] = useState<Record<Faction, string>>({ red: "red_recruiter", blue: "blue_recruiter" });
  const [cmdTarget, setCmdTarget] = useState<"general" | "intel" | "both">("both");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [camp, setCamp] = useState<Campaign | null>(null);
  const [xs, setXs] = useState<Record<Faction, XStatus> | null>(null);
  const [ap, setAp] = useState<Autopilot | null>(null);
  const [gen, setGen] = useState<Gen | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const autoDrafting = useRef<Record<Faction, boolean>>({ red: false, blue: false });

  // ── loaders ──
  const loadPosts = useCallback(async () => {
    const [r, b, o] = await Promise.all([
      fetch("/api/admin/recruiter?faction=red"),
      fetch("/api/admin/recruiter?faction=blue"),
      fetch("/api/admin/recruiter?faction=founder"),
    ]);
    const rp = r.ok ? ((await r.json()).posts as Post[]) : [];
    const bp = b.ok ? ((await b.json()).posts as Post[]) : [];
    const op = o.ok ? ((await o.json()).posts as Post[]) : [];
    setPosts([...rp, ...bp, ...op]);
  }, []);
  const loadAp = useCallback(async () => {
    const r = await fetch("/api/admin/autopilot");
    if (r.ok) setAp(await r.json());
  }, []);
  const loadGen = useCallback(async () => {
    const r = await fetch("/api/admin/general");
    if (r.ok) {
      const d = (await r.json()) as Gen;
      setGen(d);
      setPct(d.orders.recruit_pct);
      setNotes(d.notes ?? "");
    }
  }, []);
  useEffect(() => {
    fetch("/api/admin/campaign").then((r) => (r.ok ? r.json() : null)).then(setCamp).catch(() => {});
    fetch("/api/admin/x/status").then((r) => (r.ok ? r.json() : null)).then((d) => d && setXs(d.accounts)).catch(() => {});
    loadAp().catch(() => {});
    loadGen().catch(() => {});
    loadPosts().catch(() => {});
    const t = setInterval(() => loadPosts().catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, [loadAp, loadGen, loadPosts]);

  // ── actions ──
  const post = useCallback(
    async (action: string, extra: Record<string, unknown>, tag: string, faction: Faction | "founder") => {
      setBusy(tag);
      setErr(null);
      try {
        const res = await fetch("/api/admin/recruiter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, faction, ...extra }),
        });
        const d = await res.json();
        if (!res.ok) setErr(d.error ?? "Failed");
        await loadPosts();
      } finally {
        setBusy(null);
      }
    },
    [loadPosts],
  );
  function deny(id: number, faction: Faction | "founder") {
    const reason = window.prompt("Why deny this? (your reason trains BOTH agents)");
    if (reason?.trim()) post("deny", { id, reason: reason.trim() }, `deny-${id}`, faction);
  }
  async function apPost(body: Record<string, unknown>) {
    setBusy("ap");
    setErr(null);
    try {
      const r = await fetch("/api/admin/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) setErr(d.error ?? "Failed");
      await loadAp();
      await loadPosts();
    } finally {
      setBusy(null);
    }
  }
  async function genPost(body: Record<string, unknown>) {
    setBusy("gen");
    setErr(null);
    try {
      const r = await fetch("/api/admin/general", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) setErr(d.error ?? "Failed");
      await loadGen();
    } finally {
      setBusy(null);
    }
  }
  function savePct() {
    if (pct != null && gen && pct !== gen.orders.recruit_pct) genPost({ action: "set", patch: { recruit_pct: pct } });
  }
  async function startCampaign() {
    const r = await fetch("/api/admin/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", days: 15 }) });
    if (r.ok) setCamp(await r.json());
  }

  // An empty DRAFT column drafts itself — once per emptiness, never twice at once.
  useEffect(() => {
    if (!posts) return;
    for (const f of ["red", "blue"] as Faction[]) {
      const queued = posts.filter((p) => p.faction === f && p.status === "queued").length;
      if (queued > 0) {
        autoDrafting.current[f] = false;
      } else if (!autoDrafting.current[f]) {
        autoDrafting.current[f] = true;
        post("draft", { auto: true }, `draft-${f}`, f).catch(() => {});
      }
    }
  }, [posts, post]);

  const byTeam = useMemo(() => {
    const out: Record<Faction, { all: Post[]; n: Record<Status, number> }> = {
      red: { all: [], n: { queued: 0, posted: 0, denied: 0 } },
      blue: { all: [], n: { queued: 0, posted: 0, denied: 0 } },
    };
    for (const p of posts ?? []) {
      if (p.faction !== "red" && p.faction !== "blue") continue;
      out[p.faction].all.push(p);
      if (p.status === "queued" || p.status === "posted" || p.status === "denied") out[p.faction].n[p.status]++;
    }
    return out;
  }, [posts]);

  // ── one post card ──
  function card(p: Post, f: Faction | "founder") {
    const theme = themeOf(p.reason);
    return (
      <div key={p.id} className={"cc-card " + p.status}>
        <div className="cc-card-top">
          <span className="cc-card-side">
            {p.angle && <span className={"cc-angle a-" + p.angle}>{p.angle}</span>}
            {theme && <span className="cc-theme">{theme}</span>}
            <span className="cc-dim"> {p.format === "video" ? `video · ${p.video_kind ?? ""}` : "text"}</span>
            {p.replaces ? <span className="cc-dim"> · replaces #{p.replaces}</span> : null}
          </span>
          <span className={"cc-status " + p.status}>{p.status === "queued" ? "draft" : p.status}</span>
        </div>
        <p className="cc-copy">{p.copy}</p>
        {p.format === "video" && !p.media_url && p.status === "queued" && (
          <p className="cc-why">🎬 video placeholder — the clip (and its caption) render from live data shortly before this slot</p>
        )}
        {p.reason && <p className="cc-why">🧪 {cleanReason(p.reason)}</p>}
        {p.deny_reason && <p className="cc-denied">✕ {p.deny_reason}</p>}
        {p.status === "queued" && p.scheduled_for && (
          <p className="cc-why">⏱ posts {new Date(p.scheduled_for).toLocaleString()} unless denied</p>
        )}
        {p.last_error && <p className="cc-denied">⚠ {p.last_error}</p>}
        {p.media_url && p.status !== "denied" && (
          <a className="xlink" href={p.media_url} target="_blank" rel="noreferrer">
            ▶ Watch clip
          </a>
        )}
        {p.status === "posted" && (
          <p className="cc-metrics" title={p.metrics_at ? `X metrics as of ${new Date(p.metrics_at).toLocaleTimeString()}` : "metrics refresh hourly"}>
            👁 {p.impressions ?? 0} · ♥ {p.likes ?? 0} · 🔁 {p.reposts ?? 0} · 💬 {p.replies ?? 0} · 🔗 {p.clicks ?? 0} clicks
          </p>
        )}
        {p.external_id && f !== "founder" && (
          <a className="xlink" href={`https://x.com/i/status/${p.external_id}`} target="_blank" rel="noreferrer">
            ↗ View on X
          </a>
        )}
        {p.status === "queued" && (
          <div className="cc-card-acts">
            <button className="cc-btn sm" onClick={() => post("publish", { id: p.id }, `pub-${p.id}`, f)} disabled={busy === `pub-${p.id}`}>
              {busy === `pub-${p.id}` ? "Posting…" : "▶ Post now"}
            </button>
            <button className="cc-btn sm ghost" onClick={() => deny(p.id, f)} disabled={busy === `deny-${p.id}`}>
              ✕ Deny
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── a team column: queue + chat ──
  function teamColumn(f: Faction) {
    const t = byTeam[f];
    const shown = t.all.filter((p) => p.status === filter[f]);
    const focus = gen ? gen.orders[f === "red" ? "red_focus" : "blue_focus"] : "";
    const recruits = gen?.brief.campaign ? (f === "red" ? gen.brief.campaign.redRecruits : gen.brief.campaign.blueRecruits) : null;
    return (
      <section className="cc-teamcol" data-faction={f}>
        <div className="cc-h">
          <span>
            {DOT[f]} {NAME[f]} TEAM
            {recruits != null && gen?.brief.campaign && (
              <span className="cc-dim"> · {recruits}/{gen.brief.campaign.perTeam} recruits</span>
            )}
          </span>
          {xs?.[f]?.handle ? (
            <a
              className="cc-pill-x"
              href={`https://x.com/${xs[f].handle.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${xs[f].handle} on X`}
            >
              {xs[f].handle} {xs[f].ok ? "✓" : "✗"}
            </a>
          ) : (
            <span className="cc-pill-x">{xs?.[f] ? `X ${xs[f].ok ? "✓" : "✗"}` : "…"}</span>
          )}
        </div>
        {focus && <p className="cc-mini">🎖️ {focus}</p>}

        <div className="cc-col-head">
          <div className="cc-filters">
            {(["queued", "posted", "denied"] as const).map((s) => (
              <button key={s} className={filter[f] === s ? "on" : ""} onClick={() => setFilter({ ...filter, [f]: s })}>
                {s === "queued" ? "DRAFT" : s.toUpperCase()} {t.n[s]}
              </button>
            ))}
          </div>
          <button className="cc-btn sm" onClick={() => post("draft", {}, `draft-${f}`, f)} disabled={busy === `draft-${f}`}>
            {busy === `draft-${f}` ? "Thinking…" : "⚡ Draft"}
          </button>
        </div>
        {filter[f] === "queued" && (
          <p className="cc-mini">Drafts are the day&apos;s placeholders — each is rewritten from live data at post time; video cards render just before their slot.</p>
        )}
        {!posts ? (
          <p className="adm-loading">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="cc-empty">{filter[f] === "queued" && busy === `draft-${f}` ? "Drafting…" : `Nothing ${filter[f] === "queued" ? "in draft" : filter[f]}.`}</p>
        ) : (
          <div className="cc-queue">{shown.map((p) => card(p, f))}</div>
        )}

        <div className="cc-h">
          <span>💬 CHAT</span>
          <select className="cc-select" value={chatTarget[f]} onChange={(e) => setChatTarget({ ...chatTarget, [f]: e.target.value })}>
            {TEAM_AGENTS[f].map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <ChatBox target={chatTarget[f]} placeholder={`Message ${TEAM_AGENTS[f].find((a) => a.key === chatTarget[f])?.label.replace(/^\S+\s/, "") ?? ""}…`} />
      </section>
    );
  }

  return (
    <>
      {/* mission banner: the real goal + the countdown */}
      <div className="cc-banner">
        <div className="cc-banner-goal">
          <span className="cc-banner-l">THE MISSION</span>
          <span className="cc-banner-v">${(camp?.goalUsd ?? 200000).toLocaleString()} in revenue</span>
        </div>
        <div className="cc-banner-goal">
          <span className="cc-banner-l">RECRUITING GOAL</span>
          <span className="cc-banner-v">
            1,000 · 500 per team
            {gen?.brief.campaign && (
              <span className="cc-dim"> — 🔴 {gen.brief.campaign.redRecruits} · 🔵 {gen.brief.campaign.blueRecruits}</span>
            )}
          </span>
        </div>
        <div className="cc-banner-camp">
          {camp?.daysLeft != null ? (
            <>
              <span className="cc-banner-days">{camp.daysLeft}</span>
              <span className="cc-banner-l">days left in the campaign</span>
            </>
          ) : (
            <button className="cc-btn sm" onClick={startCampaign}>
              ▶ Start 15-day campaign
            </button>
          )}
        </div>

        {/* ops strip: money live?, autopilot, last tick */}
        <div className="cc-ops">
          <GateButton />
          <TikTokButton />
          <CartButton />
          <StripeToggle onChange={() => loadAp().catch(() => {})} />
          <button
            className={"cc-btn sm" + (ap?.config.enabled ? "" : " ghost")}
            disabled={!ap || busy === "ap"}
            onClick={() => apPost({ action: "set", patch: { enabled: !ap?.config.enabled } })}
          >
            {ap?.config.enabled ? "⏸ AUTOPILOT ON" : "▶ AUTOPILOT OFF"}
          </button>
          <button className="cc-btn sm ghost" disabled={!ap || busy === "ap"} onClick={() => apPost({ action: "run" })}>
            {busy === "ap" ? "Running…" : "↻ Run tick now"}
          </button>
          <span className="cc-ops-note">
            {ap?.state.last_result ? `Last tick: ${ap.state.last_result}` : "Autopilot hasn't run yet."}
            {ap ? ` · ${ap.config.review_minutes}m review window · ${ap.config.posts_per_day_per_team} text posts/day/team · 1 recruiting video + field reports daily` : ""}
          </span>
          {err && <span className="cc-ops-err">{err}</span>}
        </div>
      </div>

      <div className="cc3">
        {teamColumn("red")}

        {/* COMMAND: notes, orders, intel, and the General / Intel / BOTH chat */}
        <section className="cc-cmdcol">
          <div className="cc-h">
            <span>🎖️ COMMAND</span>
          </div>

          <h3 className="cc-goals-h">🎥 THE DEVELOPER</h3>
          <p className="cc-mini">
            You, outside the fiction, once a day (rendered ~10am Mountain, reviewed here, then to your TikTok via RobinReach). Building in public from real commits and real player activity. Never money.
          </p>
          <div className="cc-founder">
            {(posts ?? []).filter((p) => p.faction === "founder").slice(0, 4).map((p) => card(p, "founder"))}
            {(posts ?? []).filter((p) => p.faction === "founder").length === 0 && <p className="cc-mini">No Developer clip yet today.</p>}
          </div>

          <h3 className="cc-goals-h">📌 COMMANDER&apos;S NOTES</h3>
          <textarea
            className="cc-goal"
            rows={4}
            value={notes}
            placeholder="Standing feedback for ALL agents — outranks the orders."
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (gen && notes.trim() !== (gen.notes ?? "").trim()) genPost({ action: "notes", text: notes });
            }}
          />
          <p className="cc-mini">Goes into every prompt — both Social agents, the General, and chat. Deny reasons from either team train both.</p>

          <h3 className="cc-goals-h">🎖️ GENERAL&apos;S ORDERS</h3>
          {gen ? (
            <>
              <div className="cc-slider-l">
                <span>reporting</span>
                <span className="cc-slider-v">{pct ?? gen.orders.recruit_pct}% recruiting</span>
                <span>recruiting</span>
              </div>
              <input
                type="range"
                className="cc-slider"
                min={0}
                max={100}
                step={5}
                value={pct ?? gen.orders.recruit_pct}
                onChange={(e) => setPct(Number(e.target.value))}
                onMouseUp={savePct}
                onTouchEnd={savePct}
                onKeyUp={savePct}
                disabled={busy === "gen"}
              />
              <p className="cc-mini">
                {gen.orders.pct_locked_by_commander ? "Mix locked by you" : `Mix set by ${gen.orders.by}`}
                {gen.orders.pct_locked_by_commander && (
                  <>
                    {" · "}
                    <button type="button" className="cc-linkbtn" onClick={() => genPost({ action: "unlock" })}>
                      let the General decide
                    </button>
                  </>
                )}
              </p>
              <ul className="cc-orders">
                {gen.orders.directives.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              {gen.orders.rationale && <p className="cc-mini">💬 {gen.orders.rationale}</p>}
              <button className="cc-btn sm ghost" onClick={() => genPost({ action: "plan" })} disabled={busy === "gen"}>
                {busy === "gen" ? "Planning…" : "🎖️ Ask the General to re-plan"}
              </button>
            </>
          ) : (
            <p className="adm-loading">Loading…</p>
          )}

          <h3 className="cc-goals-h">📊 INTEL — THE BRIEF</h3>
          {gen ? (
            <>
              <p className="cc-mini">
                The exact brief every agent receives — the General plans from it, the Social agents draft from it, the producer scripts from it. Rebuilt on every load (as of {new Date(gen.brief.at).toLocaleTimeString()}).
              </p>
              <div className="cc-brief">
                {gen.brief.text.split("\n").map((line, i) => {
                  const idx = line.indexOf(":");
                  const label = idx > 0 && idx < 22 ? line.slice(0, idx) : null;
                  return (
                    <p key={i}>
                      {label ? <b>{label}:</b> : null}
                      {label ? line.slice(idx + 1) : line}
                    </p>
                  );
                })}
              </div>
              <p className="cc-intel">
                X so far: 👁 <b>{gen.brief.social.impressions}</b> impressions · ♥ <b>{gen.brief.social.engagements}</b> engagements · 🔗 <b>{gen.brief.social.clicks}</b> clicks to the site
                <br />
                Revenue <b>${(gen.brief.funnel.spentTotalCents / 100).toFixed(2)}</b> · win-backs <b>{gen.brief.funnel.winbacks7d}/{gen.brief.funnel.takeoverEmails7d}</b>
              </p>
            </>
          ) : (
            <p className="adm-loading">Loading…</p>
          )}

          <div className="cc-h">
            <span>💬 CHAT</span>
            <div className="cc-filters">
              {(["both", "general", "intel"] as const).map((k) => (
                <button key={k} className={cmdTarget === k ? "on" : ""} onClick={() => setCmdTarget(k)}>
                  {k === "both" ? "🔴🔵 BOTH" : k === "general" ? "🎖️ GENERAL" : "📊 INTEL"}
                </button>
              ))}
            </div>
          </div>
          <ChatBox
            key={cmdTarget}
            target={cmdTarget}
            placeholder={cmdTarget === "both" ? "Say it once — both Social agents hear it…" : cmdTarget === "general" ? "Message the General…" : "Ask Intel Ops for a report…"}
          />
        </section>

        {teamColumn("blue")}
      </div>
    </>
  );
}
