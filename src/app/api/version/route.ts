// Which deploy is live — open pages poll this and reload when it changes.
export const dynamic = "force-dynamic";

export function GET() {
  const v = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
