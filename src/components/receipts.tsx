"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ViewNav } from "./board";
import { getReceipts, type Receipt } from "@/lib/receipts";

function fmt(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Receipts() {
  const [list, setList] = useState<Receipt[] | null>(null);

  useEffect(() => {
    setList(getReceipts());
  }, []);

  const total = (list ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div className="cartridge receipts">
        <Link href="/settings" className="back-btn" aria-label="Back to settings">
          ‹ BACK
        </Link>
        <header className="bg-header">
          <div className="wordmark">
            <span className="coin">$</span>receipts
          </div>
          <div className="roundline">
            <span className="rc-total-line">
              TOTAL SPENT · <b>${total}</b>
            </span>
          </div>
        </header>

        <section className="rc-section">
          <h2 className="fm-h">REQUISITION LOG</h2>
          {list == null ? (
            <p className="fm-note">Loading…</p>
          ) : list.length === 0 ? (
            <p className="fm-note">
              No charges yet. Every paid order shows up here — you&apos;ll always
              be able to see exactly what you spent.
            </p>
          ) : (
            <ul className="rc-list">
              {list.map((r) => (
                <li key={r.id} className={"rc-item rc-" + r.side}>
                  <span className="rc-dot" aria-hidden="true" />
                  <span className="rc-main">
                    <span className="rc-action">{r.action}</span>
                    <span className="rc-meta">
                      {fmt(r.ts)} · {r.tiles} tile{r.tiles === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="rc-amt">${r.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="rc-foot">
          This is your full charge history. Nothing is hidden — receipts are also
          sent to your email once payments are live.
        </p>
      </div>

      <ViewNav active="/receipts" />
    </>
  );
}
