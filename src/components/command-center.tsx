"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartButton, StripeToggle } from "@/components/stripe-ops";

type Faction = "red" | "blue" | null;
interface Agent {
  key: string;
  name: string;
  emoji: string;
  faction: Faction;
  role: string;
  hasQueue: boolean;
  mission: string;
  goals: string[];
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
  social: { posted: number; queued: number };
}
interface Gen {
  orders: Orders;
  brief: Brief;
  notes: string;
}
interface Post {
  id: number;
  status: string;
  format: string;
  angle: string | null;
  x_account: string | null;
  copy: string;
  video_kind: string | null;
  reason: string | null;
  deny_reason: string | null;
  external_id: string | null;
  replaces: number | null;
  scheduled_for: string | null;
  last_error: string | null;
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
interface Msg {
  id?: number;
  role: string;
  content: string;
}
interface Campaign {
  endsAt: string | null;
  daysLeft: number | null;
  goalUsd: number;
}

const ROSTER: Agent[] = [
  { key: "general", name: "The General", emoji: "🎖️", faction: null, role: "general", hasQueue: false, mission: "Sets standing orders for both teams from Intel's brief; runs the funnel toward $200K.", goals: ["Turn X attention into visits, signups, and paid flips — $200K.", "Keep both feeds on strategy: the right recruiting mix for the moment.", "Report to you with numbers, not vibes."] },
  { key: "intel", name: "Intel Ops", emoji: "📊", faction: null, role: "analyst", hasQueue: false, mission: "Maintains the brief every agent works from; reports what's working.", goals: ["Keep the brief accurate: board, funnel, post performance.", "Find what drives clicks → visits → revenue and say so plainly.", "Hand the General 1-3 prioritized actions every report."] },
  { key: "red_recruiter", name: "Red Social", emoji: "📣", faction: "red", role: "@RedBattleGround", hasQueue: true, mission: "Runs @RedBattleGround under the General's orders — each post's angle is scheduled from the recruiting mix.", goals: ["Bring recruits to Red — measured in link clicks and signups.", "Recruiting posts are ads: offer, urgency, call to action, link.", "Grow @RedBattleGround into a feed people follow for the war itself."] },
  { key: "red_anchor", name: "Sienna Cole", emoji: "🎙️", faction: "red", role: "desk", hasQueue: false, mission: "Red Team News, from the desk.", goals: ["Make every board swing feel like breaking news."] },
  { key: "red_field", name: "Rowan Cross", emoji: "📡", faction: "red", role: "field", hasQueue: false, mission: "Red field correspondent, on the front.", goals: ["File field reports on the live board.", "Toss back to Sienna by name."] },
  { key: "blue_recruiter", name: "Blue Social", emoji: "📣", faction: "blue", role: "@BluBattleGround", hasQueue: true, mission: "Runs @BluBattleGround under the General's orders — each post's angle is scheduled from the recruiting mix.", goals: ["Bring recruits to Blue — measured in link clicks and signups.", "Recruiting posts are ads: offer, urgency, call to action, link.", "Grow @BluBattleGround into a feed people follow for the war itself."] },
  { key: "blue_anchor", name: "Sterling Wells", emoji: "🎙️", faction: "blue", role: "desk", hasQueue: false, mission: "Blue Team News, from the desk.", goals: ["Make every board swing feel like breaking news."] },
  { key: "blue_field", name: "Skye Bennett", emoji: "📡", faction: "blue", role: "field", hasQueue: false, mission: "Blue field correspondent, on the front.", goals: ["File field reports on the live board.", "Toss back to Sterling by name."] },
];

const GROUPS: { label: string; keys: string[] }[] = [
  { label: "COMMAND", keys: ["general", "intel"] },
  { label: "🔴 RED TEAM", keys: ["red_recruiter", "red_anchor", "red_field"] },
  { label: "🔵 BLUE TEAM", keys: ["blue_recruiter", "blue_anchor", "blue_field"] },
];

const DEFAULT_GOAL =
  "Recruit players — the war is LIVE at dollarbattleground.com. Get people to pick your side and flip tiles.";

export function CommandCenter() {
  const [sel, setSel] = useState("red_recruiter");
  const [tab, setTab] = useState<"chat" | "queue">("queue");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [camp, setCamp] = useState<Campaign | null>(null);
  const [xs, setXs] = useState<Record<"red" | "blue", XStatus> | null>(null);
  const [ap, setAp] = useState<Autopilot | null>(null);
  const [gen, setGen] = useState<Gen | null>(null);
  const [pct, setPct] = useState<number | null>(null); // slider position (saved on release)
  const [notes, setNotes] = useState(""); // Commander's standing feedback (saved on blur)
  const chatEnd = useRef<HTMLDivElement>(null);

  const agent = ROSTER.find((a) => a.key === sel)!;

  const loadPosts = useCallback(async (faction: string) => {
    const r = await fetch(`/api/admin/recruiter?faction=${faction}`);
    setPosts(r.ok ? (await r.json()).posts : []);
  }, []);
  const loadChat = useCallback(async (key: string) => {
    const r = await fetch(`/api/admin/agent-chat?agent=${key}`);
    setMsgs(r.ok ? (await r.json()).messages : []);
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
  }, [loadAp, loadGen]);

  // The General's orders: slider / re-plan / unlock.
  async function genPost(body: Record<string, unknown>) {
    setBusy("gen");
    setErr(null);
    try {
      const r = await fetch("/api/admin/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
  useEffect(() => {
    setTab(agent.hasQueue ? "queue" : "chat");
    loadChat(agent.key);
    if (agent.faction) loadPosts(agent.faction);
    else setPosts(null);
  }, [agent, loadChat, loadPosts]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, tab]);

  const kpis = useMemo(() => {
    const p = posts ?? [];
    return {
      queued: p.filter((x) => x.status === "queued").length,
      posted: p.filter((x) => x.status === "posted").length,
      denied: p.filter((x) => x.status === "denied").length,
    };
  }, [posts]);

  async function post(action: string, extra: Record<string, unknown>, tag: string) {
    setBusy(tag);
    setErr(null);
    try {
      const res = await fetch("/api/admin/recruiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, faction: agent.faction, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) setErr(d.error ?? "Failed");
      if (agent.faction) await loadPosts(agent.faction);
    } finally {
      setBusy(null);
    }
  }
  function deny(id: number) {
    const reason = window.prompt("Why deny this? (your reason trains the agent)");
    if (reason?.trim()) post("deny", { id, reason: reason.trim() }, `deny-${id}`);
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMsgs((m) => [...m, { role: "commander", content: text }]);
    setBusy("chat");
    try {
      const res = await fetch("/api/admin/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey: agent.key, message: text }),
      });
      const d = await res.json();
      setMsgs((m) => [...m, { role: "agent", content: d.reply ?? d.error ?? "…" }]);
    } finally {
      setBusy(null);
    }
  }

  async function startCampaign() {
    const r = await fetch("/api/admin/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", days: 15 }),
    });
    if (r.ok) setCamp(await r.json());
  }

  // Autopilot switch / forced tick — then refresh what it changed.
  async function apPost(body: Record<string, unknown>) {
    setBusy("ap");
    setErr(null);
    try {
      const r = await fetch("/api/admin/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error ?? "Failed");
      await loadAp();
      if (agent.faction) await loadPosts(agent.faction);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* mission banner: the real goal + the countdown */}
      <div className="cc-banner">
        <div className="cc-banner-goal">
          <span className="cc-banner-l">THE MISSION</span>
          <span className="cc-banner-v">${(camp?.goalUsd ?? 200000).toLocaleString()} in revenue</span>
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

        {/* ops strip: are the accounts real, is money live, is the autopilot on */}
        <div className="cc-ops">
          <CartButton />
          {(["red", "blue"] as const).map((f) => {
            const s = xs?.[f];
            return (
              <span key={f} className={"cc-pill " + (s ? (s.ok ? "ok" : "bad") : "")} title={s?.error ?? s?.name ?? ""}>
                {f === "red" ? "🔴" : "🔵"} {s ? `${s.handle ?? "X"} ${s.ok ? "✓" : "✗"}` : "…"}
              </span>
            );
          })}
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
            {ap ? ` · ${ap.config.review_minutes}m review window · ${ap.config.posts_per_day_per_team}/day/team` : ""}
          </span>
        </div>
      </div>

      <div className="cc">
        {/* roster grouped by team */}
        <aside className="cc-roster">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <h3 className="cc-roster-h">{g.label}</h3>
              {g.keys.map((k) => {
                const a = ROSTER.find((x) => x.key === k)!;
                return (
                  <button
                    key={a.key}
                    className={"cc-agent" + (sel === a.key ? " on" : "")}
                    data-faction={a.faction ?? "cmd"}
                    onClick={() => setSel(a.key)}
                  >
                    <span className="cc-ava">{a.emoji}</span>
                    <span className="cc-agent-id">
                      <span className="cc-agent-name">{a.name}</span>
                      <span className="cc-agent-status">{a.role}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* center: chat + (recruiter) queue */}
        <main className="cc-main">
          <header className="cc-main-head">
            <span className="cc-ava lg" data-faction={agent.faction ?? "cmd"}>{agent.emoji}</span>
            <div>
              <h2 className="cc-main-name">{agent.name}</h2>
              <p className="cc-main-mission">{agent.mission}</p>
            </div>
          </header>

          <div className="cc-tabs">
            <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>💬 Chat</button>
            {agent.hasQueue && (
              <button className={tab === "queue" ? "on" : ""} onClick={() => setTab("queue")}>📋 Queue</button>
            )}
          </div>

          {tab === "chat" ? (
            <div className="cc-chat">
              <div className="cc-chat-log">
                {msgs.length === 0 && (
                  <p className="cc-empty">Say hi to {agent.name.split(" ")[0]} — coach them, ask for a plan.</p>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className={"cc-msg " + m.role}>
                    {m.content}
                  </div>
                ))}
                {busy === "chat" && <div className="cc-msg agent cc-typing">…</div>}
                <div ref={chatEnd} />
              </div>
              <div className="cc-chat-in">
                <textarea
                  rows={2}
                  value={input}
                  placeholder={`Message ${agent.name.split(" ")[0]}…`}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button className="cc-btn" onClick={send} disabled={busy === "chat" || !input.trim()}>
                  Send
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="cc-actions">
                <button className="cc-btn" onClick={() => post("draft", { goal }, "draft")} disabled={busy === "draft"}>
                  {busy === "draft" ? "Thinking…" : "⚡ Draft a post"}
                </button>
                {err && <span className="ct-error">{err}</span>}
              </div>
              {!posts ? (
                <p className="adm-loading">Loading…</p>
              ) : posts.length === 0 ? (
                <p className="cc-empty">No posts yet — hit “Draft a post”.</p>
              ) : (
                <div className="cc-queue">
                  {posts.map((p) => (
                    <div key={p.id} className={"cc-card " + p.status}>
                      <div className="cc-card-top">
                        <span className="cc-card-side">
                          {p.x_account === "blue" ? "🔵" : "🔴"}
                          {p.angle && <span className={"cc-angle a-" + p.angle}>{p.angle}</span>}
                          <span className="cc-dim"> {p.format === "video" ? `video · ${p.video_kind ?? ""}` : "text"}</span>
                          {p.replaces ? <span className="cc-dim"> · replaces #{p.replaces}</span> : null}
                        </span>
                        <span className={"cc-status " + p.status}>{p.status}</span>
                      </div>
                      <p className="cc-copy">{p.copy}</p>
                      {p.reason && <p className="cc-why">💡 {p.reason}</p>}
                      {p.deny_reason && <p className="cc-denied">✕ {p.deny_reason}</p>}
                      {p.status === "queued" && p.scheduled_for && (
                        <p className="cc-why">⏱ posts {new Date(p.scheduled_for).toLocaleString()} unless denied</p>
                      )}
                      {p.last_error && <p className="cc-denied">⚠ {p.last_error}</p>}
                      {p.external_id && (
                        <a className="xlink" href={`https://x.com/i/status/${p.external_id}`} target="_blank" rel="noreferrer">
                          ↗ View on X
                        </a>
                      )}
                      {p.status === "queued" && (
                        <div className="cc-card-acts">
                          <button className="cc-btn sm" onClick={() => post("publish", { id: p.id }, `pub-${p.id}`)} disabled={busy === `pub-${p.id}`}>
                            {busy === `pub-${p.id}` ? "Posting…" : "▶ Post now"}
                          </button>
                          <button className="cc-btn sm ghost" onClick={() => deny(p.id)} disabled={busy === `deny-${p.id}`}>
                            ✕ Deny
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {/* right: goal + numbers */}
        <aside className="cc-goals">
          {agent.hasQueue ? (
            <>
              <h3 className="cc-goals-h">GOAL</h3>
              <textarea className="cc-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={4} />
              <p className="cc-note">Give the goal — {agent.name.split(" ")[0]} figures out how. Deny a post and your reason trains it.</p>
              <h3 className="cc-goals-h">ACTIVITY</h3>
              <div className="cc-kpis">
                <div className="cc-kpi"><span className="cc-kpi-n">{kpis.queued}</span><span className="cc-kpi-l">queued</span></div>
                <div className="cc-kpi"><span className="cc-kpi-n good">{kpis.posted}</span><span className="cc-kpi-l">posted</span></div>
                <div className="cc-kpi"><span className="cc-kpi-n bad">{kpis.denied}</span><span className="cc-kpi-l">denied</span></div>
              </div>
            </>
          ) : (
            <>
              <h3 className="cc-goals-h">ROLE</h3>
              <p className="cc-note">{agent.mission}</p>
              <p className="cc-note">
                Chat to coach {agent.name.split(" ")[0]} or ask for ideas. {agent.faction ? `Their clips post from ${agent.faction === "red" ? "@RedBattleGround" : "@BluBattleGround"}.` : "They command both teams toward the $200K goal."}
              </p>
            </>
          )}

          {/* chain of command: this agent's goals, the General's orders, Intel's numbers */}
          <h3 className="cc-goals-h">{agent.name.split(" ")[0].toUpperCase()}&apos;S GOALS</h3>
          <ul className="cc-goals-list">
            {agent.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>

          <h3 className="cc-goals-h">📌 COMMANDER&apos;S NOTES</h3>
          <textarea
            className="cc-goal"
            rows={4}
            value={notes}
            placeholder="Standing feedback for ALL agents — e.g. “Recruiting posts must explain the game to a newcomer, not report the score.”"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (gen && notes.trim() !== (gen.notes ?? "").trim()) genPost({ action: "notes", text: notes });
            }}
          />
          <p className="cc-mini">Goes into every prompt — both Social agents, the General, and chat — and outranks the orders. Deny reasons from either team train both.</p>

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
                    <button type="button" className="cc-linkbtn" onClick={() => genPost({ action: "unlock" })}>let the General decide</button>
                  </>
                )}
              </p>
              <ul className="cc-orders">
                {gen.orders.directives.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              {agent.faction && (gen.orders[agent.faction === "red" ? "red_focus" : "blue_focus"] || "") && (
                <p className="cc-mini">
                  <b>{agent.faction === "red" ? "Red" : "Blue"} focus:</b> {gen.orders[agent.faction === "red" ? "red_focus" : "blue_focus"]}
                </p>
              )}
              {gen.orders.rationale && <p className="cc-mini">💬 {gen.orders.rationale}</p>}
              <button className="cc-btn sm ghost" onClick={() => genPost({ action: "plan" })} disabled={busy === "gen"}>
                {busy === "gen" ? "Planning…" : "🎖️ Ask the General to re-plan"}
              </button>
            </>
          ) : (
            <p className="adm-loading">Loading…</p>
          )}

          <h3 className="cc-goals-h">📊 INTEL</h3>
          {gen ? (
            <p className="cc-intel">
              Board <b>R {gen.brief.board.red} / B {gen.brief.board.blue}</b> · 24h <b>{gen.brief.board.flips24h}</b> flips ({gen.brief.board.toRed24h}→R, {gen.brief.board.toBlue24h}→B)
              <br />
              Waitlist <b>{gen.brief.funnel.waitlistTotal}</b> (+{gen.brief.funnel.waitlist24h} today) · Players <b>{gen.brief.funnel.players}</b> ({gen.brief.funnel.active24h} active)
              <br />
              Posted <b>{gen.brief.social.posted}</b> · Queued <b>{gen.brief.social.queued}</b> · Spent <b>${(gen.brief.funnel.spentTotalCents / 100).toFixed(2)}</b>
              <br />
              This week: <b>{gen.brief.funnel.signups7d}</b> signups · <b>{gen.brief.funnel.purchases7d}</b> purchases (${(gen.brief.funnel.revenue7dCents / 100).toFixed(2)}) · win-backs <b>{gen.brief.funnel.winbacks7d}/{gen.brief.funnel.takeoverEmails7d}</b>
            </p>
          ) : (
            <p className="adm-loading">Loading…</p>
          )}
          <p className="cc-mini">Every agent drafts from this brief. Ask Intel Ops for the full report in chat.</p>
        </aside>
      </div>
    </>
  );
}
