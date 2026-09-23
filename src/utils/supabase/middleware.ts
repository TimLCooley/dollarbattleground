import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin-shared";

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

  // Coming Soon gate: non-admins see the gate for every real page.
  const path = request.nextUrl.pathname;
  if (!isExempt(path) && !(user && isAdminUser(user))) {
    const url = request.nextUrl.clone();
    url.pathname = "/coming-soon";
    const gated = NextResponse.rewrite(url);
    // carry over any auth cookies set above (e.g. anon sign-in)
    supabaseResponse.cookies.getAll().forEach((c) => gated.cookies.set(c));
    return gated;
  }

  return supabaseResponse;
}
