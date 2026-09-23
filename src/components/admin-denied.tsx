import Link from "next/link";

// Shared "above your pay grade" screen for every admin route. Middleware already
// hides /admin/* from non-admins; this is the server-side backstop.
export function AdminDenied() {
  return (
    <div className="adm-denied">
      <div className="ts-stamp">TOP SECRET</div>
      <div className="adm-denied-kicker">◆ CLEARANCE REQUIRED ◆</div>
      <h1>ACCESS DENIED</h1>
      <p>
        This file is above your pay grade, soldier. Command personnel only — log
        in with authorized credentials.
      </p>
      <Link href="/" className="adm-denied-link">
        ‹ Return to the board
      </Link>
    </div>
  );
}
