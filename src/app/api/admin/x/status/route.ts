import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { whoAmI, xConfigured, type Faction } from "@/lib/x";

// Admin health check: which X account each faction's credentials really post
// as. Flags expired tokens and a token that posts as the wrong account.

const EXPECTED: Record<Faction, string> = { red: "@RedBattleGround", blue: "@BluBattleGround" };

export interface XAccountStatus {
  ok: boolean;
  handle?: string;
  name?: string;
  error?: string;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const accounts: Record<Faction, XAccountStatus> = { red: { ok: false }, blue: { ok: false } };
  for (const f of ["red", "blue"] as Faction[]) {
    if (!xConfigured(f)) {
      accounts[f] = { ok: false, error: "not configured" };
      continue;
    }
    try {
      const me = await whoAmI(f);
      const handle = `@${me.username}`;
      const matches = handle.toLowerCase() === EXPECTED[f].toLowerCase();
      accounts[f] = matches
        ? { ok: true, handle, name: me.name }
        : { ok: false, handle, name: me.name, error: `credentials post as ${handle}, expected ${EXPECTED[f]}` };
    } catch (e) {
      accounts[f] = { ok: false, error: e instanceof Error ? e.message : "failed" };
    }
  }
  return NextResponse.json({ accounts });
}
