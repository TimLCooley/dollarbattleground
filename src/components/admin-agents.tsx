"use client";

import { useEffect, useState } from "react";

interface Agent {
  id?: string;
  slug: string;
  name: string;
  role: string;
  personality: string | null;
  avatar: string | null;
  color: string | null;
  active: boolean;
  isNew?: boolean;
}
interface AgentEvent {
  id: number;
  agent_slug: string;
  kind: string;
  summary: string;
  created_at: string;
}

const BLANK: Agent = {
  slug: "",
  name: "",
  role: "custom",
  personality: "",
  avatar: "🤖",
  color: "#46d17a",
  active: true,
  isNew: true,
};

function AgentCard({
  agent,
  onSaved,
  onDeleted,
}: {
  agent: Agent;
  onSaved: (a: Agent) => void;
  onDeleted: (a: Agent) => void;
}) {
  const [draft, setDraft] = useState<Agent>(agent);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof Agent>(k: K, v: Agent[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Save failed");
      return;
    }
    setMsg("Saved ✓");
    onSaved({ ...data.agent, isNew: false });
  }

  async function remove() {
    if (!draft.id) {
      onDeleted(draft);
      return;
    }
    if (!window.confirm(`Delete agent "${draft.name}"?`)) return;
    setBusy(true);
    await fetch(`/api/admin/agents?id=${draft.id}`, { method: "DELETE" });
    setBusy(false);
    onDeleted(draft);
  }

  return (
    <div
      className="ag-card"
      style={{ borderColor: draft.color ?? "#0c3c21" }}
    >
      <div className="ag-card-top">
        <input
          className="ag-avatar"
          value={draft.avatar ?? ""}
          maxLength={2}
          onChange={(e) => set("avatar", e.target.value)}
          aria-label="Avatar emoji"
        />
        <div className="ag-idcol">
          <input
            className="ag-name"
            value={draft.name}
            placeholder="Agent name"
            onChange={(e) => set("name", e.target.value)}
          />
          <input
            className="ag-slug"
            value={draft.slug}
            placeholder="slug"
            disabled={!draft.isNew}
            onChange={(e) =>
              set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
          />
        </div>
        <label className="ag-active">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          <span>{draft.active ? "ON" : "OFF"}</span>
        </label>
      </div>

      <div className="ag-row">
        <label className="ag-field">
          <span>Role</span>
          <select value={draft.role} onChange={(e) => set("role", e.target.value)}>
            <option value="sow">sow</option>
            <option value="board_manager">board_manager</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <label className="ag-field ag-color">
          <span>Color</span>
          <input
            type="color"
            value={draft.color ?? "#46d17a"}
            onChange={(e) => set("color", e.target.value)}
          />
        </label>
      </div>

      <label className="ag-field">
        <span>Personality</span>
        <textarea
          className="ag-persona"
          rows={4}
          value={draft.personality ?? ""}
          placeholder="How this agent talks and provokes players…"
          onChange={(e) => set("personality", e.target.value)}
        />
      </label>

      <div className="ag-actions">
        <button className="ag-save" onClick={save} disabled={busy}>
          {busy ? "…" : "SAVE"}
        </button>
        <button className="ag-del" onClick={remove} disabled={busy}>
          DELETE
        </button>
        {msg && <span className="ag-msg">{msg}</span>}
      </div>
    </div>
  );
}

export function AdminAgents() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/agents");
      if (res.ok) {
        const d = await res.json();
        setAgents(d.agents);
        setEvents(d.events);
      } else {
        setAgents([]);
      }
    })();
  }, []);

  function onSaved(a: Agent) {
    setAgents((prev) => {
      const list = prev ?? [];
      const i = list.findIndex((x) => x.slug === a.slug);
      if (i >= 0) {
        const next = [...list];
        next[i] = a;
        return next;
      }
      return [...list, a];
    });
  }
  function onDeleted(a: Agent) {
    setAgents((prev) => (prev ?? []).filter((x) => x !== a && x.slug !== a.slug));
  }

  if (!agents) return <p className="adm-loading">Loading agents…</p>;

  return (
    <div className="ag">
      <div className="ag-grid">
        {agents.map((a) => (
          <AgentCard key={a.id ?? a.slug} agent={a} onSaved={onSaved} onDeleted={onDeleted} />
        ))}
        <button
          className="ag-add"
          onClick={() =>
            setAgents((prev) => [...(prev ?? []), { ...BLANK, slug: "", id: undefined }])
          }
        >
          + New agent
        </button>
      </div>

      <section className="ag-log">
        <h2 className="ag-log-h">◆ ACTIVITY LOG</h2>
        {events.length === 0 ? (
          <p className="ag-log-empty">
            No agent activity yet — agents come online in the next phase. Every
            message and action they take will stream here.
          </p>
        ) : (
          <ul className="ag-log-list">
            {events.map((e) => (
              <li key={e.id} className="ag-log-item">
                <span className="ag-log-slug">{e.agent_slug}</span>
                <span className="ag-log-kind">{e.kind}</span>
                <span className="ag-log-sum">{e.summary}</span>
                <span className="ag-log-time">
                  {new Date(e.created_at).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
