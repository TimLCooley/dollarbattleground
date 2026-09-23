"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import "./feel.css";

type Side = "blue" | "red";
type Kind = "overlay" | "3d";

interface Effect {
  key: string;
  name: string;
  kind: Kind;
  anim?: string; // overlay animation class
  vibe: number[]; // navigator.vibrate pattern
}

const EFFECTS: Effect[] = [
  { key: "flash", name: "Flashbang", kind: "overlay", anim: "feelflash", vibe: [55, 30, 120] },
  { key: "shock", name: "Shockwave", kind: "overlay", anim: "feelshock", vibe: [170] },
  { key: "pop", name: "Frag", kind: "overlay", anim: "feelpop", vibe: [35, 15, 40] },
  { key: "stamp", name: "Stamp", kind: "overlay", anim: "feelstamp", vibe: [45, 25, 75] },
];

const colorVar = (s: Side) => (s === "red" ? "var(--red)" : "var(--blue)");

/* ---------- Web Audio war-sound engine (no files) ----------
   Each hit = sharp CRACK transient + distorted BODY + long SUB rumble,
   run through a compressor and a battlefield reverb so it reads as a real
   explosion outdoors, not a synth blip. */
let AC: AudioContext | null = null;
let MASTER: GainNode | null = null;
let VERB: ConvolverNode | null = null;

function distortionCurve(amount: number) {
  const n = 1024;
  const c = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 2 - 1;
    c[i] = ((3 + k) * x * 20 * Math.PI) / (Math.PI + k * Math.abs(x)) / 180;
  }
  return c;
}
function impulseResponse(c: AudioContext, dur: number, decay: number) {
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return buf;
}
function ac(): AudioContext {
  if (!AC) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    AC = new Ctor();
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    comp.connect(AC.destination);
    MASTER = AC.createGain();
    MASTER.gain.value = 1;
    MASTER.connect(comp);
    VERB = AC.createConvolver();
    VERB.buffer = impulseResponse(AC, 0.6, 2.6);
    const verbGain = AC.createGain();
    verbGain.gain.value = 0.9;
    VERB.connect(verbGain).connect(MASTER);
  }
  if (AC.state === "suspended") void AC.resume();
  return AC;
}
function noiseBuffer(c: AudioContext, dur: number) {
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function adsr(g: GainNode, c: AudioContext, attack: number, peak: number, dur: number) {
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
// sharp initial CRACK
function crack(c: AudioContext, freq: number, dur: number, peak: number) {
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = freq;
  const g = c.createGain();
  adsr(g, c, 0.0005, peak, dur);
  s.connect(f).connect(g).connect(MASTER!);
  s.start();
  s.stop(c.currentTime + dur + 0.02);
}
// distorted mid BODY of the blast, sent to reverb
function body(
  c: AudioContext,
  freq: number,
  dur: number,
  peak: number,
  dist: number,
  wet: number,
) {
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = freq;
  const ws = c.createWaveShaper();
  ws.curve = distortionCurve(dist);
  ws.oversample = "2x";
  const g = c.createGain();
  adsr(g, c, 0.003, peak, dur);
  s.connect(f).connect(ws).connect(g);
  g.connect(MASTER!);
  if (wet > 0) {
    const w = c.createGain();
    w.gain.value = wet;
    g.connect(w).connect(VERB!);
  }
  s.start();
  s.stop(c.currentTime + dur + 0.05);
}
// long low SUB rumble
function sub(
  c: AudioContext,
  f0: number,
  f1: number,
  dur: number,
  peak: number,
  wet: number,
) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = "sine";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  adsr(g, c, 0.004, peak, dur);
  o.connect(g).connect(MASTER!);
  if (wet > 0) {
    const w = c.createGain();
    w.gain.value = wet;
    g.connect(w).connect(VERB!);
  }
  o.start(t);
  o.stop(t + dur + 0.05);
}
// metallic ring for the stamp/clang
function metal(c: AudioContext, base: number, dur: number, peak: number) {
  [1, 1.48, 2.13].forEach((mult, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime;
    o.type = "square";
    o.frequency.value = base * mult;
    adsr(g, c, 0.001, peak * (i === 0 ? 1 : 0.4), dur * (i === 0 ? 1 : 0.6));
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = base * mult;
    f.Q.value = 8;
    o.connect(f).connect(g).connect(MASTER!);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
}
function play(key: string) {
  try {
    ac();
    const c = AC!;
    switch (key) {
      case "flash": // flashbang: blinding crack + bright blast + tight sub
        crack(c, 3200, 0.05, 1);
        body(c, 2000, 0.28, 0.9, 40, 0.35);
        sub(c, 190, 55, 0.45, 0.7, 0.2);
        break;
      case "shock": // mortar impact: deep, long, cavernous
        crack(c, 1400, 0.03, 0.55);
        body(c, 480, 0.55, 0.95, 22, 0.6);
        sub(c, 95, 20, 0.95, 1, 0.45);
        break;
      case "pop": // frag grenade: snappy small blast
        crack(c, 2600, 0.03, 0.85);
        body(c, 1300, 0.16, 0.8, 28, 0.3);
        sub(c, 170, 65, 0.22, 0.7, 0.15);
        break;
      case "stamp": // heavy metal impact: clang + thud
        metal(c, 220, 0.22, 0.5);
        body(c, 600, 0.12, 0.6, 18, 0.25);
        sub(c, 150, 55, 0.18, 0.75, 0.2);
        break;
    }
  } catch {
    /* audio unavailable */
  }
}

function FeelTile({
  effect,
  sound,
  haptics,
}: {
  effect: Effect;
  sound: boolean;
  haptics: boolean;
}) {
  const [side, setSide] = useState<Side>("blue");
  const [fx, setFx] = useState<{ id: number; to: Side } | null>(null);
  const idRef = useRef(0);

  const fire = useCallback(() => {
    if (fx) return; // ignore taps mid-animation
    const to: Side = side === "blue" ? "red" : "blue";
    if (sound) play(effect.key);
    if (haptics) {
      try {
        navigator.vibrate?.(effect.vibe);
      } catch {
        /* no haptics */
      }
    }
    setFx({ id: ++idRef.current, to });
  }, [fx, side, sound, haptics, effect]);

  const done = useCallback(() => {
    setFx((cur) => {
      if (cur) setSide(cur.to);
      return null;
    });
  }, []);

  return (
    <button className="feel-card" onClick={fire} type="button">
      <div className="feel-stage">
        <div
          className={`feel-tile feel-plate${effect.kind === "3d" ? " d3" : ""}`}
          style={{ backgroundColor: colorVar(side) }}
        >
          {fx && effect.kind === "overlay" && (
            <div
              key={fx.id}
              className={`feel-ov feel-plate ${effect.anim}`}
              style={{ backgroundColor: colorVar(fx.to) }}
              onAnimationEnd={done}
            />
          )}
          {fx && effect.kind === "3d" && (
            <div key={fx.id} className="feel-flip3d" onAnimationEnd={done}>
              <div
                className="feel-face feel-plate"
                style={{ backgroundColor: colorVar(side) }}
              />
              <div
                className="feel-face back feel-plate"
                style={{ backgroundColor: colorVar(fx.to) }}
              />
            </div>
          )}
        </div>
      </div>
      <span className="feel-name">{effect.name}</span>
      <span className="feel-hint">tap to fire</span>
    </button>
  );
}

export default function FeelPage() {
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);

  return (
    <main className="feel-wrap">
      <div className="feel-head">
        <h1>FEEL TEST</h1>
        <p>Tap each tile to fire it — sound + vibration. Turn your ringer on.</p>
        <Link href="/admin/fx">‹ back to all effects</Link>
      </div>

      <div className="feel-toggles">
        <button
          className="feel-toggle"
          data-on={sound}
          onClick={() => setSound((v) => !v)}
          type="button"
        >
          SOUND {sound ? "ON" : "OFF"}
        </button>
        <button
          className="feel-toggle"
          data-on={haptics}
          onClick={() => setHaptics((v) => !v)}
          type="button"
        >
          VIBRATE {haptics ? "ON" : "OFF"}
        </button>
      </div>

      <div className="feel-grid">
        {EFFECTS.map((e) => (
          <FeelTile key={e.key} effect={e} sound={sound} haptics={haptics} />
        ))}
      </div>

      <p className="feel-note">
        Vibration fires on Android. iPhone Safari blocks web haptics — you&apos;ll
        feel these once we ship a native/app wrapper.
      </p>
    </main>
  );
}
