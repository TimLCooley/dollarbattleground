# Dollar Battleground — Security Audit & Test Plan

_Audit date: 2026-09-13. Scope: full app — auth, payments, DB (RLS/RPC), email,
client trust boundaries. Reviewer: Claude (session audit)._

This is a pre-launch hardening pass before the AI-agent phase. Findings are
ranked by severity. **C = Critical (blocks real-money launch), H = High,
M = Medium, L = Low / hygiene.**

---

## 🔴 C1 — The board can be painted for free; Stripe is fully bypassable

**This is the one that matters.** `public.claim_tiles(p_cells, p_team)` is
`SECURITY DEFINER`, granted to `anon, authenticated`, and called **directly from
the browser** (`src/components/board.tsx:135`). It validates only that the team
is `red`/`blue`. It does **not** check payment, cost, tile count, or which tiles.

**Impact:** anyone can open the console and run
`supabase.rpc('claim_tiles', { p_cells: <all 225 cells>, p_team: 'blue' })` to
paint the entire board instantly — winning the game and bypassing every Stripe
charge. Payment gating today is 100% client-side; the flip and the charge are
two independent calls, and the flip needs no proof of the charge. A griefer or
a competitor can neutralize the whole product (and its revenue) in one request.

Note: the earlier `claim_cell` RPC (in `battleground_core.sql`) did this
correctly — it debited a wallet with a balance guard (`insufficient credits`).
The live board abandoned that server-authoritative economy.

**Fix (server-authoritative flips).** The tile flip must be caused by a verified
payment, not trusted from the client:

1. Put the target cells in the PaymentIntent `metadata` at creation time
   (they're already known — `pending.idxs`).
2. Add a **Stripe webhook** (`/api/stripe/webhook`) that verifies the signature
   and, on `payment_intent.succeeded`, performs the flip server-side using the
   service-role key (calling `claim_tiles` or a new `claim_paid` RPC).
3. **Revoke** `execute` on the paint RPC from `anon, authenticated` so only the
   server (service role) can flip. The client no longer calls it directly.
4. The **free first tile** needs its own guarded path: a `claim_free_tile` RPC
   that server-side enforces one free claim per user (e.g. a `placed_first`
   flag on `profiles`, checked and set atomically).

Until this lands, treat the game as **demo-only** — do not switch Stripe to live
keys.

---

## 🟠 H1 — Player identity / progress isn't server-authoritative

All player stats live in `localStorage` (`bg_player_v1`): `spent`, `rank`,
`captures`, `isOfficer`, `reclaimed`, etc. A user can edit these freely.

**Impact:** cosmetic today (rank/impact are vanity), **but** `isOfficer` gates
the $10 Airstrike UI, and rank/badges will likely gate real perks later. Once
anything of value keys off these, client-owned stats become an exploit. The
officer $10 action still requires a real Stripe charge, so there's no direct
money bypass here yet — this is about integrity as the game grows.

**Fix:** move authoritative counters (spend, captures, officer status, rank) to
the DB, derived from confirmed payments / server events. `localStorage` becomes
a cache, not the source of truth.

## 🟠 H2 — Cross-device login won't restore progress or the saved card

OTP login (`signInWithOtp` + `verifyOtp`) creates/signs into an **email**
account, but the anonymous play session is never **linked** to it
(`enable_manual_linking = true` is set but unused). A returning player on a new
device gets a fresh user id — different Stripe customer (card not saved),
different (empty) progress. The super-admin trigger only fires for
`timlcooley@gmail.com` on a *new* `auth.users` insert, so linking an email to an
existing anon admin user would not set `is_admin`.

**Fix:** link the email identity to the current anon user
(`updateUser({ email })` / `linkIdentity`) so the id — and thus the Stripe
customer and progress — carries over. Handle the admin-flag on link, not only on
insert.

---

## 🟡 M1 — 3-D Secure one-tap path is mishandled

In `spend-confirm.tsx`, if a saved-card one-tap returns `requires_action` (3DS),
the code mounts a fresh `PaymentElement` with that client secret. The correct
handling is `stripe.handleNextAction({ clientSecret })`. Cards needing 3DS
(e.g. test `4000 0025 0000 3155`) will fail to complete.

**Fix:** branch on `requires_action` → `handleNextAction`, then treat success
like the normal path.

## 🟡 M2 — No idempotency / rate limiting on money + DNS endpoints

- `/api/stripe/payment-intent` creates a PI per call with no idempotency key;
  rapid double-taps can create duplicate intents (only one is confirmed, so no
  double charge today, but it's untidy and abusable).
- `/api/email/validate` is unauthenticated and does a live DNS `resolveMx` per
  request — a cheap amplification/DoS lever.

**Fix:** add a Stripe idempotency key keyed to (user, action, short window);
add basic per-IP/user rate limiting to the public API routes; cache MX lookups.

## 🟡 M3 — Two divergent schemas / dead economy code

`battleground_core.sql` (10×10 `cells`, `wallets`, `transactions`, `factions`,
`feed`, `claim_cell`) is the **old** server-authoritative economy and is unused
by the live game (`tiles` + `claim_tiles`). Keeping both invites confusion and
accidental use of the wrong path.

**Fix:** decide the target. The old wallet/transaction model is actually the
secure pattern C1 needs — consider reviving it rather than deleting. Either way,
document which is canonical and remove/quarantine the other.

---

## 🟢 L1 — Secret hygiene

- **SendGrid API key was pasted in chat — rotate it** before production (create
  new, delete old). Same for the Stripe **test** keys (low risk, but roll if you
  want a clean transcript).
- Secrets are correctly in `.env.local` (gitignored); **no secrets are
  hardcoded in `src/`** (verified). Good.
- Production needs the Stripe + SendGrid keys added to **Vercel env** — add the
  *rotated* keys, so the exposed ones never touch prod.

## 🟢 L2 — Minor correctness notes

- `confirmSpend` (`board.tsx`) uses an `eslint-disable` on its dep array and
  reads `cells` via closure; low risk (recomputed each render) but worth a clean
  dep list.
- `resolveTestEmail` "aaa" alias is correctly `NODE_ENV`-guarded — confirm the
  prod build strips it (it does at build time).
- Email HTML templates currently contain no user input; **escape any
  user-supplied value** (email address, name) if added to future receipt emails.

---

## ✅ What's already solid

- Payment **amount is derived server-side** from `kind` (`AMOUNTS` map) — the
  client can't tamper the price.
- Stripe customer is tied to the Supabase auth user via metadata; charges carry
  `supabase_user_id` + action metadata.
- RLS is enabled on all tables; reads are public, writes go through
  `SECURITY DEFINER` RPCs with `set search_path = ''` (search-path-attack safe).
- `/api/email/test` is correctly dev-gated (404 in production).
- Parameterized `jsonb` claim payload — no SQL injection surface.

---

## Testing — next steps

**A. Payment integrity (do first — validates the C1 fix).**
1. With server-side flips in place, attempt the console exploit
   (`supabase.rpc('claim_tiles', …)`) and confirm it is **rejected**.
2. Confirm a tile only flips after `payment_intent.succeeded` (kill the browser
   between charge and flip — the webhook should still paint it).
3. Decline paths: test cards `4000000000000002` (declined),
   `4000000000009995` (insufficient funds), `4000002500003155` (3DS) — verify no
   flip on failure, and 3DS completes.
4. Idempotency: double-tap AUTHORIZE — exactly one charge, one flip.

**B. Auth / accounts.**
5. `aaa`, `aaa1`, `aaa2` → distinct customers, all mail to the owner inbox.
6. OTP login on a second browser → confirm whether progress/card carry over
   (currently they won't — H2).
7. `timlcooley@gmail.com` OTP → verify `profiles.is_admin = true` and JWT
   `app_metadata.is_admin`.

**C. Email / validation.**
8. Fake/typo/disposable emails rejected at claim; MX-less domains rejected.
9. Receipt email fires from the webhook (once built), from
   `no-reply@dollarbattleground.com`, and lands in inbox.

**D. Load / abuse.**
10. Hammer `/api/email/validate` and `/api/stripe/payment-intent` — confirm rate
    limiting once added.

**E. Regression.**
11. `npx next build` clean; core flows (enlist → claim → buy → receipt) pass on
    mobile viewport.

---

## Readiness for the agent phase

The agent scaffolding already exists: `feed.source` is constrained to
`('system', 'sow', 'board_manager')` — the **SOW** and **Board Manager** agents
have a home. Before wiring agents that provoke spending, the game must be
**server-authoritative** (C1), because agents will react to board state and
trigger offers; if the board can be freely painted, agent-driven economics are
meaningless. **Recommended order: fix C1 (server-side paid flips + webhook) →
move authoritative state to DB (H1) → then build the agents on top of a
trustworthy board + economy.**
