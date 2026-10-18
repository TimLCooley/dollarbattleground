import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

const OLD_HOSTS = new Set(["dollarbattleground.com", "www.dollarbattleground.com"]);

export async function proxy(request: NextRequest) {
  // Old domain → commanderbg.com, without signing anyone out. /api stays put
  // (Stripe webhooks, the cron) and /handoff runs here to pack up the login.
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const path = request.nextUrl.pathname;
  if (OLD_HOSTS.has(host) && !path.startsWith("/api/") && path !== "/handoff") {
    const where = path + request.nextUrl.search;
    const hasLogin = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    if (hasLogin) {
      const u = new URL("/handoff", `https://${host}`);
      u.searchParams.set("to", where);
      return NextResponse.redirect(u, 307);
    }
    return NextResponse.redirect(`https://commanderbg.com${where}`, 308);
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
