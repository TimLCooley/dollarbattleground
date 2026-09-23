import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { agentByKey } from "@/lib/agents";
import { claudeChat, claudeConfigured } from "@/lib/claude";

// Chat directly with an agent (Grok-style coaching). History is stored so the
// agent remembers the conversation. Uses Gemini in the agent's persona.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const key = new URL(req.url).searchParams.get("agent");
  if (!key) return NextResponse.json({ error: "agent required" }, { status: 400 });
  const db = createAdminClient();
  const { data } = await db
    .from("agent_messages")
    .select("id,role,content,created_at")
    .eq("agent_key", key)
    .order("created_at", { ascending: true })
    .limit(100);
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { agentKey, message } = (await req.json().catch(() => ({}))) as {
    agentKey?: string;
    message?: string;
  };
  const agent = agentKey ? agentByKey(agentKey) : undefined;
  if (!agent || !message?.trim())
    return NextResponse.json({ error: "agentKey + message required" }, { status: 400 });

  const db = createAdminClient();
  // Save the commander's message.
  await db.from("agent_messages").insert({ agent_key: agentKey, role: "commander", content: message.trim() });

  // Intel Ops / analysts get the live posting data folded into their prompt.
  let dataBrief = "";
  if (agent.role === "analyst") {
    const { data: rows } = await db
      .from("agent_posts")
      .select("faction,angle,format,impressions,likes,reposts,replies,clicks,copy,posted_at")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(200);
    const posts = rows ?? [];
    if (posts.length === 0) {
      dataBrief = "\n\nDATA: nothing has been posted yet — say so and suggest a first move.";
    } else {
      const agg = new Map<string, { n: number; imp: number; eng: number; clk: number }>();
      for (const p of posts) {
        for (const k of [`team:${p.faction ?? "?"}`, `angle:${p.angle ?? "?"}`, `format:${p.format}`]) {
          const a = agg.get(k) ?? { n: 0, imp: 0, eng: 0, clk: 0 };
          a.n++;
          a.imp += p.impressions ?? 0;
          a.eng += (p.likes ?? 0) + (p.reposts ?? 0) + (p.replies ?? 0);
          a.clk += p.clicks ?? 0;
          agg.set(k, a);
        }
      }
      const lines = [...agg.entries()].map(
        ([k, a]) => `${k}: ${a.n} posts, ${a.imp} impressions (avg ${Math.round(a.imp / a.n)}), ${a.eng} engagements, ${a.clk} link clicks`,
      );
      const top = [...posts]
        .sort((x, y) => (y.clicks ?? 0) - (x.clicks ?? 0) || (y.impressions ?? 0) - (x.impressions ?? 0))
        .slice(0, 3)
        .map((p) => `[${p.clicks ?? 0} clicks, ${p.impressions ?? 0} imp] ${p.faction}/${p.angle}: "${p.copy}"`);
      dataBrief = `\n\nLIVE DATA (${posts.length} posts) — clicks = actual site visits driven (the metric that matters for revenue):\n${lines.join("\n")}\nTop by clicks:\n${top.join("\n")}`;
    }
  }

  // Recent history for context.
  const { data: hist } = await db
    .from("agent_messages")
    .select("role,content")
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (hist ?? []).reverse();

  const system = `${agent.persona}\n\nYou are ${agent.name}${agent.faction ? `, on the ${agent.faction.toUpperCase()} team` : ""}. You're talking to the COMMANDER (the human running the whole operation, whose real goal is $200K in revenue). Stay in character, be concise and genuinely useful, and give real recommendations — never just agree.${dataBrief}`;

  try {
    // Hybrid brain: Claude for the reasoning agents (General, Intel Ops); Gemini
    // for everyone else (in-character persona chat).
    const useClaude = (agent.role === "general" || agent.role === "analyst") && claudeConfigured();
    let reply: string | null = null;

    if (useClaude) {
      reply = await claudeChat(
        system,
        history.map((m) => ({ role: (m.role === "agent" ? "assistant" : "user") as "user" | "assistant", content: m.content })),
      );
    }
    if (!reply) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return NextResponse.json({ error: "no LLM key set" }, { status: 500 });
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: history.map((m) => ({ role: m.role === "agent" ? "model" : "user", parts: [{ text: m.content }] })),
            generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
          }),
        },
      );
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "…";
    }

    await db.from("agent_messages").insert({ agent_key: agentKey, role: "agent", content: reply });
    return NextResponse.json({ reply, brain: useClaude ? "claude" : "gemini" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "chat failed" }, { status: 500 });
  }
}
