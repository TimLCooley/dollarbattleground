"use client";

import Link from "next/link";
import { ViewNav } from "./board";

const ENTITY = "TLC Collective, LLC";
const GAME = "Dollar Battleground";
const CONTACT = "support@dollarbattleground.com";
const EFFECTIVE = "September 13, 2026";

export function Legal() {
  return (
    <>
      <div className="cartridge legal">
        <Link href="/settings" className="back-btn" aria-label="Back to settings">
          ‹ BACK
        </Link>
        <header className="bg-header">
          <div className="wordmark">
            <span className="coin">$</span>field manual
          </div>
          <div className="roundline">
            <span className="lg-eff">EFFECTIVE {EFFECTIVE.toUpperCase()}</span>
          </div>
        </header>

        <p className="lg-intro">
          {GAME} is a product of <b>{ENTITY}</b>, a Utah limited liability
          company. By enlisting, deploying, or making a purchase you agree to the
          terms below. Questions? Reach command at{" "}
          <a className="lg-link" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>

        {/* -------- Refunds — surfaced first, disclosed conspicuously -------- */}
        <section id="refunds" className="lg-section lg-flag">
          <h2 className="lg-h">REFUNDS — ALL SALES FINAL</h2>
          <p>
            <b>All purchases are final. We do not offer refunds.</b> Every paid
            action in {GAME} — taking a position, an X-Strike, an airstrike, or
            any future purchase — is a real-time move in a live, competitive game
            that takes effect the instant you authorize it and cannot be undone,
            reversed, or restored.
          </p>
          <p>
            Because of this, and consistent with Utah law, {ENTITY} maintains a
            strict no-refund policy, which is disclosed to you conspicuously here
            and at the point of every purchase. All sales are final and
            non-refundable, and no credits, exchanges, or chargebacks will be
            honored except where a refund is required by applicable law.
          </p>
          <p>
            Purchases buy in-game actions only. They have no cash value, are not
            transferable, and cannot be exchanged for money or anything of
            real-world value.
          </p>
        </section>

        {/* -------- Terms of Service -------- */}
        <section id="terms" className="lg-section">
          <h2 className="lg-h">TERMS OF SERVICE</h2>
          <p>
            <b>Eligibility.</b> You must be at least 18 years old and able to form
            a binding contract to play {GAME} or make a purchase.
          </p>
          <p>
            <b>The game.</b> {GAME} is a shared, real-time territory game. Boards
            are live and competitive: other players can and will take positions
            you hold. Outcomes are not guaranteed, and {ENTITY} does not promise
            that any position, rank, or advantage will last.
          </p>
          <p>
            <b>Purchases.</b> Paid actions are charged to your payment method when
            you authorize them and are governed by the no-refund policy above.
            Prices and available actions may change at any time. You are
            responsible for all charges made under your account.
          </p>
          <p>
            <b>Virtual items are a license, not property.</b> A purchase buys a
            limited, revocable license to perform an in-game action and to hold
            the resulting position for as long as the game allows. Positions,
            tiles, ranks, and other in-game items are not your property, have no
            monetary value, and cannot be sold or transferred. They may be lost,
            taken by other players, or reset through normal play or at{" "}
            {ENTITY}&apos;s discretion at any time. You are buying entertainment,
            not a permanent asset.
          </p>
          <p>
            <b>Conduct.</b> Don&apos;t cheat, exploit, automate, disrupt the
            service, or use it unlawfully. We may suspend or close accounts that
            do, without refund.
          </p>
          <p>
            <b>As-is; limitation of liability.</b> The service is provided
            &quot;as is&quot; without warranties of any kind. To the fullest
            extent permitted by law, {ENTITY}&apos;s total liability for any claim
            relating to the service is limited to the amount you paid us in the 30
            days before the claim.
          </p>
          <p>
            <b>Governing law.</b> These terms are governed by the laws of the
            State of Utah, without regard to its conflict-of-laws rules. Any
            dispute will be brought exclusively in the state or federal courts
            located in Utah, and you consent to their jurisdiction.
          </p>
        </section>

        {/* -------- Privacy Policy -------- */}
        <section id="privacy" className="lg-section">
          <h2 className="lg-h">PRIVACY POLICY</h2>
          <p>
            <b>What we collect.</b> An account identifier, the side and email you
            provide, your in-game activity (positions, actions, ranks), and
            purchase records needed to process payments and issue receipts.
          </p>
          <p>
            <b>How we use it.</b> To run the game, process purchases, send the
            dispatches you opt into, provide support, and keep the service secure.
            We do not sell your personal information.
          </p>
          <p>
            <b>Email.</b> We send email only if you opt in by giving us your
            address. Every dispatch includes a way to stand down, and you can turn
            dispatches off anytime in Settings.
          </p>
          <p>
            <b>Payments.</b> Card details are handled by our payment processor, not
            stored by {ENTITY}. We keep a record of each charge so your receipts
            stay accurate.
          </p>
          <p>
            <b>Your choices.</b> You may edit your email, opt out of dispatches, or
            delete your account and service record at any time from Settings. To
            make other privacy requests, contact{" "}
            <a className="lg-link" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </p>
        </section>

        {/* -------- Cookie Policy -------- */}
        <section id="cookies" className="lg-section">
          <h2 className="lg-h">COOKIE POLICY</h2>
          <p>
            {GAME} uses only the storage it needs to work: your browser&apos;s
            local storage keeps you signed in, remembers your side and settings,
            and holds your receipts on your device.
          </p>
          <p>
            We don&apos;t use advertising or third-party tracking cookies. Clearing
            your browser storage will sign you out and remove locally-held
            preferences and receipts from that device.
          </p>
        </section>

        <p className="lg-foot">
          © {new Date().getFullYear()} {ENTITY}. {GAME} and its insignia are
          marks of {ENTITY}. This is a draft policy pending legal review.
        </p>
      </div>

      <ViewNav active="/legal" />
    </>
  );
}
