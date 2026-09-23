import "server-only";

// Claude (Anthropic) for the reasoning agents — the General's planning and Intel
// Ops' analysis. Gemini stays for high-volume recruiter copy (the hybrid brain).

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// maxTokens covers thinking + answer: Sonnet 5 can spend several hundred
// tokens thinking, and if the budget runs out there's NO text block at all.
export async function claudeChat(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens = 2500,
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || messages.length === 0) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
    // Sonnet/Opus 5 may return a thinking block first — grab the text block.
    const text = data.content?.find((b) => b.type === "text")?.text;
    return text?.trim() ?? null;
  } catch {
    return null;
  }
}
