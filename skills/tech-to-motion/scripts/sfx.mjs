// Procedural sound effects for tech-to-motion. No samples, no licences: every sound is
// synthesised from a seed, so the same cues.json always gives the same WAV.
//
// cues.json: [{ "t": 1.20, "sfx": "pop", "gain": -3 }, { "t": 4.0, "sfx": "riser", "dur": 1.5 }, ...]
// Types: whoosh, pop, click, tick, typing, riser, impact, glitch, ding, error, swell

import { writeFileSync } from "node:fs";

const SR = 48000;

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RBJ biquad, coefficients recomputed per sample when the frequency moves.
function biquad(type, f, q) {
  const w = (2 * Math.PI * f) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === "bp") { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filterState() { return { x1: 0, x2: 0, y1: 0, y2: 0 }; }
function runFilter(st, k, x) {
  const y = k[0] * x + k[1] * st.x1 + k[2] * st.x2 - k[3] * st.y1 - k[4] * st.y2;
  st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
  return y;
}

// Each voice returns { L: Float32Array, R: Float32Array }.
function buf(sec) { const n = Math.max(1, Math.round(sec * SR)); return { L: new Float32Array(n), R: new Float32Array(n) }; }

const VOICES = {
  click(o, r) {
    const b = buf(0.03), st = filterState(), k = biquad("hp", 2200, 0.7);
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, env = Math.exp(-t / 0.004);
      const v = runFilter(st, k, r() * 2 - 1) * env * 0.9;
      b.L[i] = b.R[i] = v;
    }
    return b;
  },
  tick(o, r) {
    const b = buf(0.05);
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, env = Math.exp(-t / 0.008);
      const v = (Math.sin(2 * Math.PI * 2600 * t) * 0.6 + (r() * 2 - 1) * 0.15) * env;
      b.L[i] = b.R[i] = v * 0.7;
    }
    return b;
  },
  pop(o, r) {
    const d = 0.11, b = buf(d);
    let ph = 0;
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, f = 300 + 700 * Math.exp(-t / 0.018);
      ph += (2 * Math.PI * f) / SR;
      const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.035);
      b.L[i] = b.R[i] = Math.sin(ph) * env * 0.85;
    }
    return b;
  },
  whoosh(o, r) {
    const d = o.dur || 0.45, b = buf(d), st = filterState(), st2 = filterState();
    let pink = 0;
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, u = t / d;
      const f = 350 * Math.pow(3200 / 350, Math.sin((u * Math.PI) / 2));
      const k = biquad("bp", f, 0.9);
      pink = 0.97 * pink + 0.03 * (r() * 2 - 1) * 6;
      const env = u < 0.6 ? Math.pow(u / 0.6, 2) : Math.pow((1 - u) / 0.4, 1.5);
      const v = runFilter(st, k, pink) * env * 1.4;
      const v2 = runFilter(st2, k, r() * 2 - 1) * env * 0.25;
      const pan = o.pan === "rl" ? 1 - u : u;
      b.L[i] = (v + v2) * Math.cos((pan * Math.PI) / 2);
      b.R[i] = (v + v2) * Math.sin((pan * Math.PI) / 2);
    }
    return b;
  },
  typing(o, r) {
    const d = o.dur || 1, cps = o.cps || 22, b = buf(d + 0.05);
    // Key times from the kit (synced with the characters on screen), else a human rhythm.
    const keys = Array.isArray(o.keys) && o.keys.length ? o.keys.slice() : null;
    let t = keys ? keys.shift() : 0;
    while (t != null && t < d) {
      const key = VOICES.click({}, r);
      const g = 0.35 + r() * 0.3;
      const start = Math.round(t * SR);
      for (let i = 0; i < key.L.length && start + i < b.L.length; i++) {
        b.L[start + i] += key.L[i] * g; b.R[start + i] += key.R[i] * g;
      }
      // A softer second layer gives the key some body.
      const thock = Math.round((t + 0.004) * SR);
      for (let i = 0; i < 0.012 * SR && thock + i < b.L.length; i++) {
        const v = Math.sin(2 * Math.PI * 180 * (i / SR)) * Math.exp(-i / SR / 0.004) * 0.25 * g;
        b.L[thock + i] += v; b.R[thock + i] += v;
      }
      t = keys ? keys.shift() : t + (1 / cps) * (0.7 + r() * 0.6) * (r() < 0.12 ? 2.2 : 1);
    }
    return b;
  },
  riser(o, r) {
    const d = o.dur || 1.5, b = buf(d), st = filterState();
    let ph = 0;
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, u = t / d;
      const f = 150 * Math.pow(10, u);
      ph += (2 * Math.PI * f) / SR;
      const saw = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
      const k = biquad("bp", 500 + 5000 * u, 0.8);
      const n = runFilter(st, k, r() * 2 - 1);
      const env = Math.pow(u, 1.8);
      const v = (saw * 0.18 + Math.sin(ph) * 0.25 + n * 0.5) * env;
      b.L[i] = b.R[i] = v;
    }
    return b;
  },
  swell(o, r) {
    // Soft reverse-like swell into a reveal, gentler than the riser.
    const d = o.dur || 0.8, b = buf(d), st = filterState(), k = biquad("lp", 1800, 0.7);
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, u = t / d;
      const v = runFilter(st, k, r() * 2 - 1) * Math.pow(u, 2.5) * 1.2;
      b.L[i] = b.R[i] = v;
    }
    return b;
  },
  impact(o, r) {
    const d = 0.45, b = buf(d);
    let ph = 0;
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, f = 38 + 30 * Math.exp(-t / 0.06);
      ph += (2 * Math.PI * f) / SR;
      const body = Math.tanh(Math.sin(ph) * 2.2) * Math.exp(-t / 0.14);
      const hit = (r() * 2 - 1) * Math.exp(-t / 0.006) * 0.6;
      b.L[i] = b.R[i] = (body * 0.9 + hit) * 0.9;
    }
    return b;
  },
  glitch(o, r) {
    const d = o.dur || 0.22, b = buf(d);
    let hold = 0, val = 0;
    for (let i = 0; i < b.L.length; i++) {
      if (hold-- <= 0) { hold = Math.floor(r() * 220) + 40; val = (r() * 2 - 1) * (r() < 0.3 ? 0 : 1); }
      const t = i / SR, sq = Math.sign(Math.sin(2 * Math.PI * (60 + r() * 4) * t));
      const v = Math.round((val * 0.6 + sq * 0.25) * 6) / 6; // bit-crush
      b.L[i] = v * 0.5; b.R[i] = v * 0.45;
    }
    return b;
  },
  ding(o, r) {
    const d = 0.7, b = buf(d);
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, env = Math.min(1, t / 0.003) * Math.exp(-t / 0.18);
      const v = (Math.sin(2 * Math.PI * 1319 * t) * 0.5 + Math.sin(2 * Math.PI * 1976 * t) * 0.32 +
        Math.sin(2 * Math.PI * 2638 * t) * 0.08 * Math.exp(-t / 0.05)) * env;
      b.L[i] = b.R[i] = v * 0.7;
    }
    return b;
  },
  error(o, r) {
    const d = 0.32, b = buf(d), st = filterState(), k = biquad("lp", 1400, 0.7);
    for (let i = 0; i < b.L.length; i++) {
      const t = i / SR, f = t < 0.14 ? 330 : 220;
      const local = t < 0.14 ? t : t - 0.16;
      const env = local < 0 ? 0 : Math.min(1, local / 0.004) * Math.exp(-local / 0.07);
      const v = runFilter(st, k, Math.sign(Math.sin(2 * Math.PI * f * t))) * env;
      b.L[i] = b.R[i] = v * 0.55;
    }
    return b;
  },
};

export const SFX_TYPES = Object.keys(VOICES);

/** Render cues into a stereo 16-bit WAV of `duration` seconds. Returns stats. */
export function renderCues(cues, duration, outPath, seed = 1) {
  const n = Math.ceil(duration * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const r = rng(seed);
  const problems = [];
  cues.forEach((c, idx) => {
    const v = VOICES[c.sfx];
    if (!v) { problems.push(`cue ${idx}: unknown sfx "${c.sfx}" (use ${SFX_TYPES.join(", ")})`); return; }
    if (typeof c.t !== "number" || c.t < 0 || c.t >= duration) { problems.push(`cue ${idx}: t=${c.t} outside 0..${duration}`); return; }
    const b = v(c, r);
    const g = Math.pow(10, (c.gain || 0) / 20) * DEFAULT_GAIN[c.sfx];
    const start = Math.round(c.t * SR);
    for (let i = 0; i < b.L.length && start + i < n; i++) { L[start + i] += b.L[i] * g; R[start + i] += b.R[i] * g; }
  });
  // Peak-normalise to -3 dBFS with a soft clip guard. Loudness is set later at the final step.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0 ? 0.708 / peak : 1;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const l = Math.tanh(L[i] * norm * 1.05), rr = Math.tanh(R[i] * norm * 1.05);
    data.writeInt16LE(Math.round(l * 32767), i * 4);
    data.writeInt16LE(Math.round(rr * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(outPath, Buffer.concat([h, data]));
  return { cues: cues.length, problems, peakBeforeNorm: peak };
}

// Relative balance between effect types (the mix a sound designer would set by ear).
const DEFAULT_GAIN = {
  click: 0.35, tick: 0.3, pop: 0.45, whoosh: 0.7, typing: 0.5, riser: 0.55, swell: 0.5,
  impact: 1.0, glitch: 0.4, ding: 0.45, error: 0.45,
};
