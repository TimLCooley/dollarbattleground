import { createAdminClient } from "@/utils/supabase/admin";
import { unsubscribe } from "@/lib/dispatch";

// One-click stand-down from dispatches: ?t=<token>&kind=takeover|reminders|all.
// The token is per player and only lives in their own emails.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const kind = url.searchParams.get("kind") ?? "all";
  const ok = token ? await unsubscribe(createAdminClient(), token, kind) : false;
  const what = kind === "takeover" ? "takeover alerts" : kind === "reminders" ? "reminders" : "all dispatches";
  const body = ok
    ? `<h1>Stood down.</h1><p>You won't get ${what} anymore. Your positions are still yours.</p>`
    : `<h1>That link didn't work.</h1><p>It may have already been used. Reply to any dispatch and we'll sort it.</p>`;
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dollar Battleground</title>
     <div style="font-family:system-ui,Arial,sans-serif;background:#124f2b;min-height:100vh;padding:32px 16px;color:#f6efdb">
       <div style="max-width:480px;margin:0 auto;background:#155f33;border:3px solid #0c3c21;padding:24px">
         <div style="font-size:14px;letter-spacing:1px;color:#f2c14e;margin-bottom:12px">$ DOLLAR BATTLEGROUND</div>${body}
         <p><a style="color:#f2c14e" href="https://dollarbattleground.com/">Back to the board →</a></p>
       </div></div>`,
    { status: ok ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
