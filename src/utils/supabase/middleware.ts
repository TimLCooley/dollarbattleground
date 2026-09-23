import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin-shared";
import { createAdminClient } from "@/utils/supabase/admin";
import { getGate } from "@/lib/gate";

// Pre-launch: everything is gated to Coming Soon except the gate itself, the
// auth/api plumbing, and legal. Only the admin (recognized after email OTP)
// passes through to the real site.
function isExempt(path: string): boolean {
  return (
    path === "/coming-soon" ||
    path.startsWith("/api/") ||
    path.startsWith("/auth/") ||
    path.startsWith("/r/") ||
    path === "/legal" ||
    path.startsWith("/legal")
  );
}

// One config read per minute per instance, not per request. A read failure
// keeps the last answer (closed, until we've ever seen it open).
let gateCache = { open: false, at: 0 };
async function gatesOpen(): Promise<boolean> {
  if (Date.now() - gateCache.at < 60_000) return gateCache.open;
  try {
    const g = await getGate(createAdminClient());
    gateCache = { open: g.open, at: Date.now() };
  } catch {
    gateCache = { ...gateCache, at: Date.now() };
  }
  return gateCache.open;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { data } = await supabase.auth.signInAnonymously();
    user = data.user ?? null;
  }

  // Coming Soon gate: non-admins see the wall for every real page — until the
  // gate opens (the timer or /admin flips app_config.gate).
  const path = request.nextUrl.pathname;
  if (!isExempt(path) && !(user && isAdminUser(user)) && !(await gatesOpen())) {
    const url = request.nextUrl.clone();
    // Recruiting links land on /red or /blue — keep that side on the wall so
    // the waitlist signup is pre-picked (and the ?ref= attribution survives).
    if (path === "/red" || path === "/blue") url.searchParams.set("side", path.slice(1));
    url.pathname = "/coming-soon";
    const gated = NextResponse.rewrite(url);
    // carry over any auth cookies set above (e.g. anon sign-in)
    supabaseResponse.cookies.getAll().forEach((c) => gated.cookies.set(c));
    return gated;
  }

  return supabaseResponse;
}
