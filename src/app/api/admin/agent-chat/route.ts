import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { agentByKey } from "@/lib/agents";
import { claudeChat, claudeConfigured } from "@/lib/claude";
import { intelBrief } from "@/lib/intel";
import { getOrders } from "@/lib/general";

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

  // Every agent works from the same Intel brief (real numbers). The command
  // roles also see the General's standing orders so they can discuss them.
  const brief = await intelBrief(db);
  let dataBrief = `\n\nINTEL BRIEF (live, ${new Date(brief.at).toUTCString()}) — link clicks are real site visits, the metric that matters for revenue:\n${brief.text}`;
  if (agent.role === "general" || agent.role === "analyst") {
    const orders = await getOrders(db);
    dataBrief += `\n\nSTANDING ORDERS (recruiting mix ${orders.recruit_pct}%${orders.pct_locked_by_commander ? ", locked by the Commander" : ""}, last set by ${orders.by}):\n- ${orders.directives.join("\n- ")}\nRed focus: ${orders.red_focus || "—"}\nBlue focus: ${orders.blue_focus || "—"}`;
  }
  if (agent.goals?.length) dataBrief += `\n\nYOUR GOALS:\n- ${agent.goals.join("\n- ")}`;

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
