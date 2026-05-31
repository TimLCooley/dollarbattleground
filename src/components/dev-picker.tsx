"use client";

import { useCallback, useEffect, useState } from "react";

type Picked = {
  tag: string;
  aria: string | null;
  text: string;
  selector: string;
  component: string | null;
  source: string | null;
  rect: { top: number; left: number; width: number; height: number };
};

type Fiber = {
  type?: unknown;
  elementType?: unknown;
  return?: Fiber | null;
  _debugSource?: { fileName?: string; lineNumber?: number } | null;
};

function getReactInfo(el: Element): {
  component: string | null;
  source: string | null;
} {
  const key = Object.keys(el).find(
    (k) =>
      k.startsWith("__reactFiber$") ||
      k.startsWith("__reactInternalInstance$"),
  );
  if (!key) return { component: null, source: null };

  let fiber: Fiber | null | undefined = (el as unknown as Record<string, Fiber>)[
    key
  ];
  let component: string | null = null;
  let source: string | null = null;
  let guard = 0;

  while (fiber && guard++ < 1000) {
    const t: unknown = fiber.type ?? fiber.elementType;
    if (!component && typeof t === "function") {
      const fn = t as { displayName?: string; name?: string };
      const name = fn.displayName || fn.name;
      if (name) component = name;
    }
    if (!source && fiber._debugSource?.fileName) {
      source = `${fiber._debugSource.fileName}:${fiber._debugSource.lineNumber ?? "?"}`;
    }
    if (component && source) break;
    fiber = fiber.return;
  }

  return { component, source };
}

function buildSelector(start: Element): string {
  const parts: string[] = [];
  let node: Element | null = start;
  while (node && node.nodeType === 1 && parts.length < 4) {
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const classes = (node.getAttribute("class") || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (classes.length) part += "." + classes.join(".");

    const parent: Element | null = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === node!.tagName,
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

export function DevPicker() {
  const [active, setActive] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [copied, setCopied] = useState(false);

  const isOwnUI = useCallback(
    (el: Element | null) => !!el?.closest("[data-dev-picker]"),
    [],
  );

  useEffect(() => {
    if (!active) {
      setHoverRect(null);
      return;
    }

    function onMove(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      setHoverRect(!el || isOwnUI(el) ? null : el.getBoundingClientRect());
    }

    function onClick(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOwnUI(el)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const { component, source } = getReactInfo(el);
      setPicked({
        tag: el.tagName.toLowerCase(),
        aria: el.getAttribute("aria-label"),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
        selector: buildSelector(el),
        component,
        source,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      });
      setCopied(false);
      setActive(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActive(false);
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [active, isOwnUI]);

  const summary = picked
    ? `<${picked.tag}${picked.aria ? ` aria-label="${picked.aria}"` : ""}>` +
      (picked.component ? `\ncomponent: <${picked.component}>` : "") +
      (picked.source ? `\nsource: ${picked.source}` : "") +
      `\nselector: ${picked.selector}` +
      (picked.text ? `\ntext: "${picked.text}"` : "")
    : "";

  async function copy() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div data-dev-picker="">
      {active && hoverRect && (
        <div
          className="pointer-events-none fixed z-[9998] border-2 border-fuchsia-500 bg-fuchsia-500/10"
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}

      {picked && (
        <div
          className="pointer-events-none fixed z-[9998] border-2 border-emerald-500"
          style={{
            top: picked.rect.top,
            left: picked.rect.left,
            width: picked.rect.width,
            height: picked.rect.height,
          }}
        />
      )}

      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2 font-mono text-xs">
        {picked && (
          <div className="w-72 rounded-lg border border-neutral-300 bg-white p-3 shadow-lg">
            <div className="mb-1 font-semibold text-neutral-900">
              Selected element
            </div>
            <pre className="mb-2 whitespace-pre-wrap break-words text-[11px] leading-snug text-neutral-700">
              {summary}
            </pre>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="rounded bg-neutral-900 px-2 py-1 text-white"
              >
                {copied ? "Copied ✓" : "Copy for Claude"}
              </button>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="rounded border border-neutral-300 px-2 py-1 text-neutral-700"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setActive((a) => !a)}
          className={`rounded-full px-4 py-2 shadow-lg transition ${
            active
              ? "bg-fuchsia-600 text-white"
              : "bg-neutral-900 text-white hover:bg-neutral-700"
          }`}
        >
          {active ? "Picking… (Esc)" : "⌖ Pick element"}
        </button>
      </div>
    </div>
  );
}
