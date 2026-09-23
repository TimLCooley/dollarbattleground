# Dollar Battleground — The Agent Army (Operational Spec)

A self-running growth org for the game. You are **Commander in Chief**. You command
the **General**, who leads with goals and directs the **troops**. This doc is the
source of truth we coach from — edit it as the experiment teaches us things.

## Mission
Turn Twitter attention into paying, returning players. The funnel:

**X (acquire) → Email (retain) → Pay (convert)** — measured, bounded, and safe.

## Org chart
| Agent | Mission | Tools | Primary goal metric |
|---|---|---|---|
| **The General** | Own the mission. Set weekly goals, allocate budget, review troops, report to the Commander. | orchestration + Commander chat (Claude) | funnel throughput vs. goals |
| **Recruiter** | Drive traffic from X to the site. | `x.ts` (@RedBattleGround / @BluBattleGround) | clicks → new enlistments |
| **Herald** | Email players back — "your ground was taken, reclaim it." | Resend | return visits |
| **Quartermaster** | Nudge active players toward paying. | in-app + email | revenue |
| **Intel** | Read the live game (tiles, flips, revenue) → the data each agent needs. | Supabase | brief accuracy / freshness |
| **War Correspondent** | Turn dramatic game events into short "news report" videos for X. | Remotion (React video) + TTS voiceover | video impressions → clicks |

New troops can be spawned and coached at any time.

### Video reporting (War Correspondent)
Cheapest + best-fit path: **motion-graphics "field reports"** (election-night/ESPN style),
not AI avatars. Because the stack is React, use **Remotion** to render video from the actual
board component + live data — an agent writes the script from real events (Intel feeds it),
Remotion renders a 20-40s clip (board animation + chyrons + stats + music), a **TTS anchor
voice** narrates (ElevenLabs, or cheaper Google/OpenAI TTS), auto-posted to X. Cost ≈ **pennies
per clip** (render is compute; TTS is a few hundred chars). No avatars/watermarks; on-brand
pixel look; scales to daily/hourly. Later options: (2) stylized pixel-art anchor avatar
(HeyGen/Synthesia) for personality; (3) generative video (Sora/Veo/Runway) reserved for a
one-off launch trailer — too pricey/uncontrollable for routine reporting.

## Interaction model (the Grok-style command center, at `/admin/agents`)
- **Left:** roster (General + troops), each with a live status line ("2 drafts ready").
- **Center:** chat with an agent. Your guidance is saved as that agent's **memory** and
  folded into its system prompt — it gets smarter and more on-brand over time.
- **Right:** that agent's **Goals** + the **Data/KPIs** behind them (their "routines").

Brain: **hybrid.** Claude for the General's planning + your coaching chats; Gemini
(`agent-brain.ts`) for high-volume per-player copy.

## Rules of Engagement (enforced in code before any external action)
1. **🛡 No real-world harm.** The war is a *game*. Hard ban on inciting/threatening real
   violence, targeting/harassing real individuals, doxxing, or real political
   disinformation. Every outbound post/email passes a safety check (classifier +
   blocklist); framing stays fiction. Borderline → held for Commander approval.
2. **📭 Anti-spam / deliverability.** Opt-in only. Defaults: **≤1 email / player / 24h**,
   **≤3 / player / week**, a **global daily send ceiling** (start ~500/day, ramp
   gradually to protect domain reputation), one-click unsubscribe honored instantly.
3. **💰 Hard budgets (daily caps, blocked at the cap).** Start: **X ≤6 posts/account/day**
   (≥90 min apart), **email ≤ global ceiling**, **LLM ≤ $5/day**. The General allocates
   within caps. A global **kill-switch** halts all outbound instantly.
4. **✅ Auditable + approvable.** Every action logged (what, why, cost, outcome) and
   visible. Autonomy is **mixed + graduating**:
   - Low-risk (a scheduled X post from an approved playbook; a takeover digest within
     caps) → **auto**.
   - High-risk (mass email, a new campaign, any spend) → **approval-gated** (the "drafts
     ready" queue).
   - As trust builds: gated items **auto-send if not reviewed within a window** (e.g. 2h),
     then fully auto per playbook. The Commander sets the trust level per agent.

## Growth hooks
- **Founding Officers:** the **first 100 enlistees** are auto-promoted to Officer (2LT) and
  get a special **"Founding Officer" badge**. The Recruiter advertises this on X as the
  hook. (Server-authoritative count at enlist; badge = a distinct insignia.)

## Timeline (60-day experiment)
1. **Build** the org (phases below).
2. **~Day 15 — Soft launch:** bots run against a controlled cohort (invite/beta behind the
   Coming Soon gate). Drive some traffic, watch the funnel, fix what breaks.
3. **Tune,** then **open to the public.**
4. **60-day clock** with a metrics dashboard; review, coach, adjust weekly.

## Metrics (the dashboard)
X impressions/clicks → site visits → enlistments → returns → paid conversions → revenue;
against spend (X credits + LLM + email volume). Per-agent goal attainment.

## Data model (Supabase — to build)
- `agents` (name, role, persona, brain, trust_level, status, avatar)
- `agent_goals` (agent_id, goal, metric, target, window, progress)
- `agent_messages` (agent_id, role, content, ts) — chat + memory
- `agent_actions` (agent_id, kind, payload, cost, status[draft/approved/sent/blocked], outcome, ts)
- `guardrails` / `budgets` (caps as data, editable in the UI) + a global `kill_switch`
- `email_sends` (player_id, kind, ts) — for the per-player cooldown/caps

## Build roadmap
- **Phase 1 — Command center + first real action.** Data model; the 3-pane UI; General chat
  (Claude); guardrail/budget config + kill-switch; wire **one** troop end-to-end (Herald
  takeover-digest email, gated). *You can chat the General, set a goal, watch a troop act safely.*
- **Phase 2 — Acquisition + measurement.** Recruiter X loop (playbook posts, auto/gated per
  rules); Intel daily brief; metrics dashboard; **Founding Officers** promo.
- **Phase 3 — Autonomy.** Conversion agent; the General's scheduled morning-briefing cron that
  dispatches troops within guardrails; memory/coaching refinement; graduated auto-send.
- **Phase 4 — Soft launch ops.** Run the cohort, tune, open public, start the 60-day clock.

## To start Phase 1, I need
- To apply the agent-system migration (I'll write it; you run it in the Supabase dashboard, like `flip_bank`).
- `ANTHROPIC_API_KEY` in Vercel env (the General's Claude brain). `GEMINI_API_KEY` already set.
