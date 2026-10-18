import "server-only";
import type { Db } from "@/lib/app-config";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { DIFFICULTY, DIFFICULTY_NAME, WEEKDAY, dayNumber } from "./engine";
import { getDay } from "./server";

const SITE = "https://commanderbg.com";

/** "Today's Commander is live" — once a day to everyone who asked to be reminded. */
export async function sendCommanderReminders(db: Db): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const today = dayNumber();
  const { data: rows } = await db
    .from("commander_reminders")
    .select("id,email,token,last_sent_day")
    .eq("active", true)
    .or(`last_sent_day.is.null,last_sent_day.lt.${today}`)
    .limit(200);
  if (!rows?.length) return 0;
  const d = await getDay(db, today);
  const level = DIFFICULTY_NAME[DIFFICULTY[d.layout.weekday]];
  const weekday = WEEKDAY[d.layout.weekday];
  const army = `${d.layout.troops.archer} Archers and ${d.layout.troops.soldier} Soldiers`;
  let sent = 0;
  for (const r of rows as { id: number; email: string; token: string }[]) {
    const unsub = `${SITE}/api/commander/remind?unsub=${r.token}`;
    const res = await sendEmail({
      to: r.email,
      subject: `Commander #${today} is live — ${weekday} · ${level}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#155f33;color:#f6efdb">
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#f2c14e">COMMANDER #${today}</p>
  <h1 style="margin:0 0 12px;font-size:24px">Today's battle is live</h1>
  <p style="margin:0 0 6px;font-size:16px">${weekday} · <b>${level}</b> · ${army}.</p>
  <p style="margin:0 0 18px;font-size:16px">A new map, the same one for everyone. Practice all you like — one shot counts.</p>
  <a href="${SITE}/" style="display:inline-block;background:#f2c14e;color:#14331d;padding:12px 18px;font-weight:bold;text-decoration:none">PLAY TODAY'S MAP →</a>
  <p style="margin:22px 0 0;font-size:12px;color:#cdd8cf">You asked for a daily reminder. <a href="${unsub}" style="color:#cdd8cf">Stop these emails</a>.</p>
</div>`,
      text: `Commander #${today} is live — ${weekday} · ${level} · ${army}.\nPlay: ${SITE}/\n\nStop these reminders: ${unsub}`,
    });
    if (res.ok) {
      sent++;
      await db.from("commander_reminders").update({ last_sent_day: today }).eq("id", r.id);
    }
  }
  return sent;
}
