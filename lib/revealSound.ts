'use client';

// Sound for the score reveal (app/RevealSplash.tsx): a tick while the points count up and a hit when the
// board lands. Synthesized with Web Audio, so there are no audio files. Browsers (iOS especially) only let a
// page start audio inside a tap, so every button that opens or continues a reveal calls unlockRevealSound()
// in its click handler; the splash then plays through the same context. Mute is remembered per device.

const KEY = 'survivor-reveal-sound';
let ctx: AudioContext | null = null;
let lastTick = 0;

export function soundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: just this session */ }
  if (on) unlockRevealSound();
}

/** call synchronously inside a tap handler */
export function unlockRevealSound() {
  if (typeof window === 'undefined' || !soundOn()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    // a silent blip so iOS treats the context as started by this tap
    const g = ctx.createGain(); g.gain.value = 0; g.connect(ctx.destination);
    const o = ctx.createOscillator(); o.connect(g); o.start(); o.stop(ctx.currentTime + 0.01);
  } catch { /* no audio — the reveal still works */ }
}

function ready(): AudioContext | null {
  return ctx && ctx.state === 'running' && soundOn() ? ctx : null;
}

function tone(c: AudioContext, freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'triangle') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + dur + 0.02);
}

/** one counter tick; p = 0..1 progress through the count (the pitch climbs with it). Throttled. */
export function tick(p: number) {
  const c = ready(); if (!c) return;
  const now = performance.now();
  if (now - lastTick < 55) return;
  lastTick = now;
  tone(c, 520 + 700 * Math.min(1, Math.max(0, p)), c.currentTime, 0.05, 0.05, 'square');
}

/** the board has landed: a low thump and a bright chord */
export function hit() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  tone(c, 98, t, 0.5, 0.35, 'sine');
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + 0.02 + i * 0.03, 1.1, 0.07));
}

/** the board appears: a soft low swell */
export function whoosh() {
  const c = ready(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.5);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.65);
}
