import "server-only";
import { cfgGet, cfgSet, type Db } from "@/lib/app-config";
import { sendLaunchEmails } from "@/lib/dispatch";

// The gate. While CLOSED the Coming Soon wall collects emails by side; at the
// end of the 15-day timer (midnight Mountain) the autopilot tick opens it and
// the launch signal goes to everyone on the list, red to Red, blue to Blue.
// State lives in app_config.gate so the wall, the tick and /admin agree.

export interface Gate {
  open: boolean;
  opened_at?: string;
  opened_by?: string; // "timer" | "admin"
  launch_done?: boolean;
  launch_sent?: number;
}

export async function getGate(db: Db): Promise<Gate> {
  return (await cfgGet<Gate>(db, "gate")) ?? { open: false };
}

export async function setGate(db: Db, gate: Gate): Promise<void> {
  await cfgSet(db, "gate", gate);
}

export async function openGates(db: Db, by: "timer" | "admin"): Promise<Gate> {
  const cur = await getGate(db);
  if (cur.open) return cur;
  const next: Gate = { open: true, opened_at: new Date().toISOString(), opened_by: by, launch_done: false, launch_sent: 0 };
  await setGate(db, next);
  return next;
}

export async function closeGates(db: Db): Promise<Gate> {
  const next: Gate = { open: false };
  await setGate(db, next);
  return next;
}

// Called every tick. Opens the gate once the campaign clock runs out, then
// drains the launch list a batch at a time (Resend's rate limit and the
// function's clock both prefer a few hundred per tick over a thousand at once).
export async function openGatesIfDue(db: Db): Promise<{ opened: boolean; sent: number; done: boolean }> {
  let gate = await getGate(db);
  let opened = false;
  if (!gate.open) {
    const camp = await cfgGet<{ ends_at?: string }>(db, "campaign");
    if (camp?.ends_at && new Date(camp.ends_at).getTime() <= Date.now()) {
      gate = await openGates(db, "timer");
      opened = true;
    }
  }
  if (!gate.open || gate.launch_done) return { opened, sent: 0, done: Boolean(gate.launch_done) };
  const { sent, remaining } = await sendLaunchEmails(db, 200);
  const done = remaining === 0;
  await setGate(db, { ...gate, launch_sent: (gate.launch_sent ?? 0) + sent, launch_done: done });
  return { opened, sent, done };
}

// Midnight in Mountain time, `days` days from today — the campaign's end.
// "15 days" started on the 23rd means the gate opens as the 8th begins.
export function midnightDenver(days: number, from = new Date()): string {
  const tz = "America/Denver";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(from);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const civil = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + days, 12));
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(civil).find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(name);
  const offMin = m ? Number(m[1]) * 60 + (m[2] ? Math.sign(Number(m[1])) * Number(m[2]) : 0) : -360;
  return new Date(Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate()) - offMin * 60_000).toISOString();
}
