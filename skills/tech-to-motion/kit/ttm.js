/* tech-to-motion kit (TTM). Motion helpers for HyperFrames scenes.
 * Every helper adds tweens to a paused GSAP timeline at an absolute time and
 * returns the time its motion ends, so beats can be chained:
 *   let t = TTM.reveal(tl, "#s1-title", 0, { kind: "slam" });
 *   t = TTM.diagram(stage, spec, { prefix: "s1" }).build(tl, t + 0.2);
 * Deterministic: no Date, no Math.random (seeded rng), no rAF, no timers.
 */
(function (g) {
  "use strict";

  const EASE = {
    in: "power3.out", pop: "back.out(1.7)", soft: "back.out(1.3)", out: "power2.in",
    move: "power3.inOut", cam: "expo.inOut", snap: "expo.out", lin: "none",
  };

  const q = (s, root) => (typeof s === "string" ? (root || document).querySelector(s) : s);
  const qa = (s, root) => {
    if (typeof s === "string") return Array.from((root || document).querySelectorAll(s));
    if (Array.isArray(s)) return s.map((x) => q(x, root));
    if (s && typeof s.length === "number" && !s.tagName) return Array.from(s);
    return [s];
  };

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Sound cues. Helpers log the sounds their motion implies; ttm.mjs reads TTM.cues
     (scene-local times) and synthesises the track. Pass { sfx: false } to mute a helper. */
  const CUES = [];
  function cue(o, t, sfx, extra) {
    if (o && o.sfx === false) return;
    if (o && typeof o.sfx === "string") sfx = o.sfx;
    CUES.push(Object.assign({ t: Math.max(0, +t.toFixed(3)), sfx: sfx }, extra || {}));
  }
  const REVEAL_SFX = { slam: ["impact", 0], settle: ["impact", -3], pop: ["pop", 0], card: ["pop", -5] };

  function cssVar(el, name) {
    return getComputedStyle(el || document.body).getPropertyValue(name).trim();
  }
  /** "--err" -> the look's colour; "#hex" unchanged. */
  function color(c, el) {
    if (typeof c === "string" && c.indexOf("--") === 0) return cssVar(el || document.body, c) || c;
    return c;
  }
  function alpha(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function px(name, def) { const v = parseFloat(cssVar(document.body, name)); return isNaN(v) ? def : v; }

  /* ---------- entrances and exits ---------- */

  const KINDS = {
    rise:  { from: { opacity: 0, y: 34 }, to: { opacity: 1, y: 0 }, dur: 0.5, ease: EASE.in },
    drop:  { from: { opacity: 0, y: -34 }, to: { opacity: 1, y: 0 }, dur: 0.5, ease: EASE.in },
    left:  { from: { opacity: 0, x: -48 }, to: { opacity: 1, x: 0 }, dur: 0.5, ease: EASE.in },
    right: { from: { opacity: 0, x: 48 }, to: { opacity: 1, x: 0 }, dur: 0.5, ease: EASE.in },
    card:  { from: { opacity: 0, y: 24, scale: 0.92 }, to: { opacity: 1, y: 0, scale: 1 }, dur: 0.6, ease: EASE.in },
    pop:   { from: { opacity: 0, scale: 0.4 }, to: { opacity: 1, scale: 1 }, dur: 0.38, ease: EASE.pop },
    settle: { from: { opacity: 1, scale: 1.08 }, to: { opacity: 1, scale: 1 }, dur: 0.9, ease: "power2.out" },
    slam:  { from: { opacity: 0, scale: 1.35 }, to: { opacity: 1, scale: 1 }, dur: 0.32, ease: EASE.snap },
    blur:  { from: { opacity: 0, filter: "blur(10px)", scale: 1.04 }, to: { opacity: 1, filter: "blur(0px)", scale: 1 }, dur: 0.55, ease: EASE.in },
    fade:  { from: { opacity: 0 }, to: { opacity: 1 }, dur: 0.4, ease: "power1.out" },
    line:  { from: { opacity: 0 }, to: { opacity: 1 }, dur: 0.06, ease: EASE.lin },
  };

  /** First appearance of one or more elements (uses fromTo: call once per element). */
  function reveal(tl, target, at, o) {
    o = o || {};
    const k = KINDS[o.kind || "rise"];
    const els = qa(target);
    const dur = o.dur != null ? o.dur : k.dur;
    const stagger = o.stagger || 0;
    tl.fromTo(els, Object.assign({}, k.from),
      Object.assign({}, k.to, { duration: dur, ease: o.ease || k.ease, stagger: stagger }), at);
    els.forEach((e, i) => { const t0 = at + i * stagger; if (e._ttmShown == null || t0 < e._ttmShown) e._ttmShown = t0; });
    const fx = REVEAL_SFX[o.kind || "rise"];
    if (fx) els.forEach((e, i) => cue(o, at + i * stagger + (fx[0] === "pop" ? dur * 0.15 : 0), fx[0], { gain: fx[1] }));
    else if (o.sfx) cue(o, at, o.sfx);
    return at + dur + stagger * (els.length - 1);
  }

  /** Exit (to tween). */
  function hide(tl, target, at, o) {
    o = o || {};
    const els = qa(target);
    const dur = o.dur != null ? o.dur : 0.3;
    const props = { opacity: 0, duration: dur, ease: EASE.out, stagger: o.stagger || 0 };
    if (o.kind === "drop") props.y = 24;
    if (o.kind === "shrink") props.scale = 0.9;
    els.forEach((e) => { e._ttmHidden = at; });
    tl.to(els, props, at);
    return at + dur + (o.stagger || 0) * (els.length - 1);
  }

  /** Split text into words and reveal them one by one. Child elements count as one word each. */
  function words(tl, target, at, o) {
    o = o || {};
    const el = q(target);
    if (!el.dataset.ttmSplit) {
      const parts = [];
      Array.from(el.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((w) => { if (w) parts.push(w); });
        } else parts.push(n);
      });
      el.textContent = "";
      parts.forEach((p) => {
        if (typeof p === "string") {
          if (/^\s+$/.test(p)) { el.appendChild(document.createTextNode(" ")); return; }
          const s = document.createElement("span");
          s.className = "ttm-word"; s.textContent = p; el.appendChild(s);
        } else { p.classList.add("ttm-word"); el.appendChild(p); }
      });
      el.dataset.ttmSplit = "1";
    }
    const ws = Array.from(el.querySelectorAll(".ttm-word"));
    return reveal(tl, ws, at, { kind: o.kind || "rise", stagger: o.stagger != null ? o.stagger : 0.07, dur: o.dur, sfx: o.sfx });
  }

  /** Type text into an element with a caret. Human rhythm, seeded. Returns the end of typing. */
  function type(tl, target, text, at, o) {
    o = o || {};
    const el = q(target);
    const cps = o.cps || 26;
    const r = rng(o.seed || 7);
    let typed = el.querySelector(".ttm-typed");
    let caret = el.querySelector(".ttm-caret");
    if (!typed) {
      el.textContent = "";
      typed = document.createElement("span"); typed.className = "ttm-typed"; el.appendChild(typed);
      caret = document.createElement("span"); caret.className = "ttm-caret"; el.appendChild(caret);
    }
    const marks = [0];
    let acc = 0;
    for (let i = 0; i < text.length; i++) {
      let d = (1 / cps) * (0.75 + r() * 0.5);
      if (/[\s,.;:]/.test(text[i])) d += 0.06 + r() * 0.06;
      acc += d; marks.push(acc);
    }
    const maxDur = o.maxDur || 1.6;
    if (acc > maxDur) {
      // Long text: type the first 70 % at speed, then reveal the rest at once.
      const cut = Math.floor(text.length * 0.7);
      const scale = (maxDur - 0.08) / marks[cut];
      for (let i = 0; i <= text.length; i++) marks[i] = i <= cut ? marks[i] * scale : maxDur;
      acc = maxDur;
    }
    const total = acc;
    const prog = { t: 0 };
    typed.textContent = "";
    tl.set(caret, { opacity: 1 }, Math.max(0, at - 0.001));
    tl.fromTo(prog, { t: 0 }, {
      t: total, duration: total, ease: "none",
      onUpdate: () => {
        let lo = 0, hi = marks.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (marks[mid] <= prog.t) lo = mid; else hi = mid - 1; }
        typed.textContent = text.slice(0, lo);
      },
    }, at);
    const end = at + total;
    const keys = [];
    for (let i = 1; i < marks.length; i++) if (marks[i] > marks[i - 1] + 1e-4 && text[i - 1] !== " ") keys.push(+marks[i - 1].toFixed(3));
    cue(o, at, "typing", { dur: +total.toFixed(3), cps: cps, keys: keys });
    const blinkUntil = o.blinkUntil != null ? o.blinkUntil : end + 1.2;
    const half = 0.265;
    const n = Math.max(0, Math.floor((blinkUntil - end) / half));
    if (n > 0) tl.to(caret, { opacity: 0, duration: half, ease: "steps(1)", repeat: n - 1, yoyo: true }, end + 0.2);
    if (o.hideCaret !== false) tl.set(caret, { opacity: 0 }, blinkUntil + 0.2);
    return end;
  }

  /** Terminal output streaming: show lines one after another. */
  function stream(tl, target, at, o) {
    o = o || {};
    const st = o.stagger != null ? o.stagger : 0.11;
    const n = qa(target).length;
    for (let i = 0; i < n; i++) cue(o, at + i * st, "click", { gain: -4 });
    return reveal(tl, target, at, { kind: "line", stagger: st, sfx: false });
  }

  /* ---------- emphasis and state ---------- */

  function pulse(tl, target, at, o) {
    o = o || {};
    tl.to(qa(target), { scale: o.scale || 1.07, duration: 0.16, ease: "power2.out", yoyo: true, repeat: 1 }, at);
    return at + 0.32;
  }

  /** Dim everything except the focus elements. */
  // Only elements on screen at `at` (revealed before, not hidden yet) are dimmed or restored,
  // so focus never shows an element early and unfocus never brings back a hidden one.
  const onScreen = (e, at) => (e._ttmShown == null || e._ttmShown <= at) && !(e._ttmHidden != null && e._ttmHidden <= at);
  function focus(tl, keep, all, at, o) {
    o = o || {};
    const keepEls = qa(keep).filter((e) => onScreen(e, at));
    const others = qa(all).filter((e) => keepEls.indexOf(e) < 0 && qa(keep).indexOf(e) < 0 && onScreen(e, at));
    tl.to(others, { opacity: o.dim != null ? o.dim : 0.25, duration: 0.3, ease: "power2.out" }, at);
    tl.to(keepEls, { opacity: 1, duration: 0.3, ease: "power2.out" }, at);
    return at + 0.3;
  }
  function unfocus(tl, all, at) {
    const els = qa(all).filter((e) => onScreen(e, at));
    if (els.length) tl.to(els, { opacity: 1, duration: 0.3, ease: "power2.out" }, at);
    return at + 0.3;
  }

  function glitch(tl, target, at, o) {
    o = o || {};
    const els = qa(target);
    const a = color("--err", els[0]) || "#FF5C6C", b = color("--accent", els[0]) || "#4FC3F7";
    const f = (x) => `drop-shadow(${x}px 0px 0px ${a}) drop-shadow(${-x}px 0px 0px ${b})`;
    const step = (fx, x) => (o.noShift ? { filter: fx } : { filter: fx, x: x });
    tl.set(els, step(f(10), 6), at)
      .set(els, step(f(-6), -8), at + 0.05)
      .set(els, step(f(4), 3), at + 0.1)
      .set(els, step("none", 0), at + 0.17);
    if (!o.quiet) cue(o, at, "glitch");
    return at + 0.17;
  }

  /** Failure: state colour to --err in 2 frames, shake, glitch. */
  function fail(tl, target, at, o) {
    o = o || {};
    const els = qa(target);
    const err = cssVar(els[0], "--err") || "#FF5C6C";
    const st = { "--state": err, duration: 0.07, ease: "none" };
    if (o.colorText) st.color = err;
    tl.to(els, st, at);
    tl.to(els, { keyframes: { x: [0, -10, 9, -7, 5, -2, 0] }, duration: 0.36, ease: "none" }, at + 0.02);
    if (o.glitch !== false) glitch(tl, els, at + 0.02, { quiet: true, noShift: true });
    cue(o, at, "error");
    if (o.glitch !== false) cue(o, at + 0.02, "glitch", { gain: -4 });
    return at + 0.4;
  }

  /** Success: state colour to --ok and a pulse. */
  function ok(tl, target, at, o) {
    const els = qa(target);
    cue(o, at + 0.05, "ding");
    const okc = cssVar(els[0], "--ok") || "#3DDC97";
    tl.to(els, { "--state": okc, duration: 0.25, ease: "power2.out" }, at);
    pulse(tl, els, at + 0.05, { scale: 1.06 });
    return at + 0.37;
  }

  /** Replace one element by another in place (code value change, word pivot).
   *  Markup: <span class="ttm-swap"><span id="a">256Mi</span><span id="b">512Mi</span></span> */
  function swap(tl, from, to, at, o) {
    o = o || {};
    const a = q(from), b = q(to);
    b.style.opacity = 0;
    tl.to(a, { opacity: 0, y: -18, duration: 0.25, ease: EASE.out }, at);
    tl.fromTo(b, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.35, ease: EASE.in, immediateRender: false }, at + 0.15);
    cue(o, at + 0.1, "tick");
    return at + 0.5;
  }

  /** Tint a code line or text background with a look colour: highlight(tl, "#s4-line", t, "--err"). */
  function highlight(tl, target, at, c, o) {
    o = o || {};
    const els = qa(target);
    tl.to(els, { backgroundColor: alpha(color(c || "--accent", els[0]), o.alpha != null ? o.alpha : 0.2), duration: 0.25, ease: "power2.out" }, at);
    return at + 0.25;
  }

  /** Animated number. fmt: { decimals, prefix, suffix, sep } */
  function count(tl, target, from, to, at, o) {
    o = o || {};
    const el = q(target);
    const dec = o.decimals || 0, sep = o.sep != null ? o.sep : ",";
    const fmt = (v) => {
      const s = v.toFixed(dec).split(".");
      s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      return (o.prefix || "") + s.join(".") + (o.suffix || "");
    };
    const p = { v: from };
    el.textContent = fmt(from);
    const dur = o.dur || 1.2;
    tl.fromTo(p, { v: from }, { v: to, duration: dur, ease: o.ease || "power2.out", onUpdate: () => { el.textContent = fmt(p.v); } }, at);
    return at + dur;
  }

  /** Full-frame flash (needs a .ttm-flash element). */
  function flash(tl, target, at, o) {
    o = o || {};
    tl.fromTo(q(target), { opacity: 0 }, { opacity: o.strength || 0.8, duration: 0.04, ease: "none", yoyo: true, repeat: 1 }, at);
    return at + 0.08;
  }

  /** Slow ambient drift so no frame is ever dead (grid, backgrounds). */
  function drift(tl, target, at, dur, o) {
    o = o || {};
    tl.fromTo(q(target), { x: 0, y: 0 }, { x: o.x != null ? o.x : -28, y: o.y != null ? o.y : -18, duration: dur, ease: "none" }, at);
    return at + dur;
  }

  /* ---------- scene transitions (on the scene's .ttm-stage) ---------- */

  const ENTER = {
    push:  [{ xPercent: 100 }, { xPercent: 0, duration: 0.45, ease: EASE.move }],
    whip:  [{ xPercent: 115, filter: "blur(28px)" }, { xPercent: 0, filter: "blur(0px)", duration: 0.32, ease: EASE.snap }],
    zoom:  [{ scale: 0.8, opacity: 0.35, filter: "blur(8px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: EASE.snap }],
    rise:  [{ yPercent: 12, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45, ease: EASE.in }],
    cut:   null,
  };
  const EXIT = {
    push:  { xPercent: -100, duration: 0.45, ease: EASE.move },
    whip:  { xPercent: -115, filter: "blur(28px)", duration: 0.28, ease: "expo.in" },
    zoom:  { scale: 5, opacity: 0, filter: "blur(10px)", duration: 0.45, ease: "expo.in" },
    drop:  { yPercent: 10, opacity: 0, duration: 0.35, ease: EASE.out },
    cut:   null,
  };
  function enter(tl, stage, at, kind, o) {
    const k = ENTER[kind || "whip"];
    if (!k) return at;
    cue(o, Math.max(0, at - 0.06), "whoosh", { dur: 0.4, gain: kind === "whip" ? 0 : -4 });
    tl.fromTo(q(stage), Object.assign({}, k[0]), Object.assign({}, k[1]), at);
    return at + k[1].duration;
  }
  /** Exit ending exactly at `end` (pass the scene duration). */
  function exit(tl, stage, end, kind, o) {
    const k = EXIT[kind || "whip"];
    if (!k) return end;
    cue(o, end - k.duration - 0.05, "whoosh", { dur: k.duration + 0.15, gain: kind === "whip" ? 0 : -3 });
    tl.to(q(stage), Object.assign({}, k), end - k.duration);
    return end;
  }

  /* ---------- camera ---------- */

  function offsetIn(el, ancestor) {
    let x = 0, y = 0, n = el;
    while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y };
  }

  // Camera state per camera element, so zoom/dive/home chain correctly at build time.
  function camState(cam) {
    if (!cam._ttmCam) cam._ttmCam = { s: 1, fx: cam.offsetWidth / 2, fy: cam.offsetHeight / 2 };
    return cam._ttmCam;
  }
  function camMove(tl, cam, to, at, dur, ease) {
    const W = cam.offsetWidth, H = cam.offsetHeight;
    const from = Object.assign({}, camState(cam));
    cam._ttmCam = Object.assign({}, to);
    const p = { v: 0 };
    const ez = gsap.parseEase(ease);
    const apply = () => {
      const e = ez(p.v);
      // Geometric scale interpolation feels like a real camera; the focal point moves with it.
      const s = from.s * Math.pow(to.s / from.s, e);
      const fx = from.fx + (to.fx - from.fx) * e, fy = from.fy + (to.fy - from.fy) * e;
      gsap.set(cam, { x: W / 2 - fx * s, y: H / 2 - fy * s, scale: s, transformOrigin: "0 0" });
    };
    tl.fromTo(p, { v: 0 }, { v: 1, duration: dur, ease: "none", onUpdate: apply, immediateRender: false }, at);
  }

  /** Zoom the camera layer so `target` (an HTML element inside it) is centred and scaled. */
  function zoom(tl, camera, target, at, o) {
    o = o || {};
    const cam = q(camera), el = q(target);
    const p = offsetIn(el, cam);
    const dur = o.dur || 1.1;
    camMove(tl, cam, { s: o.scale || 2, fx: p.x + el.offsetWidth / 2 + (o.dx || 0), fy: p.y + el.offsetHeight / 2 + (o.dy || 0) },
      at, dur, o.ease || EASE.cam);
    cue(o, at + dur * 0.15, "whoosh", { dur: dur * 0.7, gain: -6 });
    return at + dur;
  }
  /** Zoom-through transition: dive into `target` until it fills the frame, ending at `end`
   *  (the scene duration). Pair with enter(..., "zoom") in the next scene. */
  function dive(tl, camera, target, end, o) {
    o = o || {};
    const dur = o.dur || 0.7;
    const cam = q(camera);
    zoom(tl, cam, target, end - dur, { scale: o.scale || 6, dur: dur, ease: "power3.in", sfx: false });
    tl.to(cam, { opacity: 0, duration: 0.12, ease: "none" }, end - 0.12);
    cue(o, end - dur, "whoosh", { dur: dur + 0.1, gain: -2 });
    return end;
  }
  function home(tl, camera, at, o) {
    o = o || {};
    const cam = q(camera);
    const dur = o.dur || 0.9;
    camMove(tl, cam, { s: 1, fx: cam.offsetWidth / 2, fy: cam.offsetHeight / 2 }, at, dur, o.ease || EASE.cam);
    return at + dur;
  }

  /* ---------- diagrams ---------- */

  const SVGNS = "http://www.w3.org/2000/svg";
  const TTMcolor = color;
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }

  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // Rough text width in px for a font size: wide caps and narrow punctuation weighted.
  function textWidth(str, size, mono) {
    if (mono) return String(str).length * size * 0.62;
    let w = 0;
    for (const ch of String(str)) w += /[MWmw@%]/.test(ch) ? 0.9 : /[A-Z0-9]/.test(ch) ? 0.7 : /[ilj.,:;|!' ]/.test(ch) ? 0.3 : 0.58;
    return w * size;
  }

  function iconMarkup(icon) {
    if (!icon) return "";
    if (typeof icon === "string") return icon.trim().startsWith("<") ? icon : `<svg viewBox="0 0 24 24"><path d="${icon}" fill="currentColor"/></svg>`;
    let color = icon.color ? (icon.color[0] === "#" ? icon.color : "#" + icon.color) : "currentColor";
    if (icon.color && luminance(color) < 0.12) color = "currentColor"; // black logos vanish on dark panels
    return `<svg viewBox="${icon.viewBox || "0 0 24 24"}"><path d="${icon.path}" fill="${color}"/></svg>`;
  }

  /**
   * Build a diagram from a spec. Coordinates are node centres in px.
   * spec = { nodes: [{ id, label, sub?, icon?, x, y, w?, h?, ghost? }],
   *          edges: [{ from, to, label?, dashed?, axis?: "h"|"v" }] }
   */
  function diagram(container, spec, o) {
    o = o || {};
    const root = q(container);
    const pre = (o.prefix || "d") + "-";
    const W = root.offsetWidth || document.body.clientWidth || 1920, H = root.offsetHeight || document.body.clientHeight || 1080;
    const fsL = px("--fs-label", 34), fsS = px("--fs-sub", 28);
    const monoLabels = /mono/i.test(cssVar(document.body, "--font-body"));
    const defH = Math.max(100, Math.round(fsL * 1.1 + fsS * 1.2 + 40));
    const nodes = {}, edges = {};
    const svg = svgEl("svg", { class: "ttm-edges", width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    root.appendChild(svg);

    spec.nodes.forEach((n) => {
      // Grow the box so label and sub always fit (estimated from font metrics: fonts may not be
      // loaded yet when this runs, so DOM measurement would be unreliable).
      const textW = Math.max(textWidth(n.label || "", fsL, monoLabels), textWidth(n.sub || "", fsS, true));
      const need = Math.ceil(56 + (n.icon ? 70 : 0) + textW + 16);
      const w = Math.max(n.w || 300, need), h = n.h || defH;
      const el = document.createElement("div");
      el.className = "ttm-node" + (n.ghost ? " ttm-ghost" : "");
      el.id = pre + "n-" + n.id;
      el.style.left = n.x - w / 2 + "px"; el.style.top = n.y - h / 2 + "px";
      el.style.width = w + "px"; el.style.height = h + "px";
      if (n.align === "center") el.style.justifyContent = "center";
      el.innerHTML = (n.icon ? `<div class="ttm-icon">${iconMarkup(n.icon)}</div>` : "") +
        `<div><div class="ttm-label"></div>${n.sub ? `<div class="ttm-sub"></div>` : ""}</div>`;
      el.querySelector(".ttm-label").textContent = n.label;
      if (n.sub) el.querySelector(".ttm-sub").textContent = n.sub;
      root.appendChild(el);
      nodes[n.id] = { el, x: n.x, y: n.y, w, h };
    });

    const HEAD = 16;
    // Pre-pass: which side each edge leaves and enters, so several edges on the same side of a
    // node are spread along it instead of stacking their arrowheads on one point.
    const sideOf = {}, slots = {};
    spec.edges.forEach((e, i) => {
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const gapX = Math.abs(dx) - (a.w + b.w) / 2, gapY = Math.abs(dy) - (a.h + b.h) / 2;
      const horiz = e.axis ? e.axis === "h" : gapX >= gapY;
      const outS = horiz ? (dx >= 0 ? "r" : "l") : (dy >= 0 ? "b" : "t");
      const inS = horiz ? (dx >= 0 ? "l" : "r") : (dy >= 0 ? "t" : "b");
      sideOf[i] = { horiz, outK: e.from + ":" + outS, inK: e.to + ":" + inS, a, b };
      (slots[e.from + ":" + outS] = slots[e.from + ":" + outS] || []).push({ i, key: horiz ? b.y : b.x });
      (slots[e.to + ":" + inS] = slots[e.to + ":" + inS] || []).push({ i, key: horiz ? a.y : a.x });
    });
    const offset = (k, i, span) => {
      const list = slots[k].slice().sort((p, q) => p.key - q.key);
      const n = list.length, idx = list.findIndex((x) => x.i === i);
      if (n < 2) return 0;
      const step = Math.min(34, span / (n + 1));
      return (idx - (n - 1) / 2) * step;
    };
    spec.edges.forEach((e, ei) => {
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) throw new Error("TTM.diagram: unknown node in edge " + e.from + " -> " + e.to);
      const dx = b.x - a.x, dy = b.y - a.y;
      // Choose the axis from the free space between the boxes, not from centre distance.
      const gapX = Math.abs(dx) - (a.w + b.w) / 2, gapY = Math.abs(dy) - (a.h + b.h) / 2;
      const horiz = e.axis ? e.axis === "h" : gapX >= gapY;
      let x1, y1, x2, y2, d;
      const sd = sideOf[ei];
      if (horiz) {
        const sx = Math.sign(dx) || 1;
        x1 = a.x + sx * (a.w / 2 + 6); y1 = a.y + offset(sd.outK, ei, a.h); x2 = b.x - sx * (b.w / 2 + 6 + HEAD); y2 = b.y + offset(sd.inK, ei, b.h);
        const mx = (x1 + x2) / 2;
        d = Math.abs(y2 - y1) < 2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
      } else {
        const sy = Math.sign(dy) || 1;
        x1 = a.x + offset(sd.outK, ei, a.w); y1 = a.y + sy * (a.h / 2 + 6); x2 = b.x + offset(sd.inK, ei, b.w); y2 = b.y - sy * (b.h / 2 + 6 + HEAD);
        const my = (y1 + y2) / 2;
        d = Math.abs(x2 - x1) < 2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
      }
      const key = e.from + ">" + e.to;
      const path = svgEl("path", { class: "ttm-edge", d, id: pre + "e-" + e.from + "-" + e.to }, svg);
      // Arrowhead along the path's final tangent.
      const L = path.getTotalLength();
      const pe = path.getPointAtLength(L), pb = path.getPointAtLength(Math.max(0, L - 2));
      const ang = Math.atan2(pe.y - pb.y, pe.x - pb.x) * 180 / Math.PI;
      const head = svgEl("polygon", { class: "ttm-head", points: `0,${-HEAD / 1.6} ${HEAD},0 0,${HEAD / 1.6}`,
        transform: `translate(${x2} ${y2}) rotate(${ang})` }, svg);
      let label = null;
      if (e.label) {
        const len = path.getTotalLength();
        const mid = path.getPointAtLength(len / 2);
        label = svgEl("text", { class: "ttm-edge-label", x: mid.x, y: mid.y - (horiz ? 18 : 0) + (horiz ? 0 : 8),
          "text-anchor": horiz ? "middle" : "start", dx: horiz ? 0 : 16 }, svg);
        label.textContent = e.label;
      }
      // Start hidden; draw() reveals.
      const plen = path.getTotalLength();
      path.style.strokeDasharray = plen; path.style.strokeDashoffset = plen;
      head.style.opacity = 0;
      if (label) label.style.opacity = 0;
      edges[key] = { path, head, label, dashed: !!e.dashed, from: e.from, to: e.to };
    });

    const api = {
      el: root, svg, nodes, edges,
      node: (id) => nodes[id].el,
      edge: (a, b) => edges[a + ">" + b].path,
      allNodes: () => Object.keys(nodes).map((k) => nodes[k].el),
      allEdges: () => Object.keys(edges).map((k) => edges[k]),
      /** Reveal in flow order: node, then edges whose two ends exist. Returns end time. */
      build(tl, at, b) {
        b = b || {};
        const order = b.order || spec.nodes.map((n) => n.id);
        const step = b.step != null ? b.step : 0.32;
        const edgeDur = b.edgeDur != null ? b.edgeDur : 0.45;
        const shown = {};
        const drawn = {};
        let t = at, end = at;
        order.forEach((id) => {
          end = Math.max(end, reveal(tl, nodes[id].el, t, { kind: "card", dur: 0.45, ease: EASE.soft, sfx: b.sfx }));
          shown[id] = true;
          Object.keys(edges).forEach((k) => {
            const E = edges[k];
            if (drawn[k] || !shown[E.from] || !shown[E.to]) return;
            drawn[k] = true;
            end = Math.max(end, api.draw(tl, E.from, E.to, t + 0.18, { dur: edgeDur }));
          });
          t += step;
        });
        return end;
      },
      /** Draw one edge. */
      draw(tl, a, b, at2, d) {
        d = d || {};
        const E = edges[a + ">" + b];
        const len = E.path.getTotalLength();
        const dur = d.dur || 0.45;
        tl.fromTo(E.path, { strokeDasharray: len, strokeDashoffset: len },
          { strokeDasharray: len, strokeDashoffset: 0, duration: dur, ease: "power2.inOut" }, at2);
        if (E.dashed) tl.set(E.path, { strokeDasharray: "10 12", strokeDashoffset: 0 }, at2 + dur);
        tl.fromTo(E.head, { opacity: 0 }, { opacity: 1, duration: dur * 0.3, ease: "none" }, at2 + dur * 0.75);
        if (E.label) tl.fromTo(E.label, { opacity: 0 }, { opacity: 1, duration: 0.25 }, at2 + dur * 0.6);
        return at2 + dur;
      },
      /** Send packets along a path of node ids, e.g. ["user","api","db"]. Returns arrival time. */
      flow(tl, ids, at2, f) {
        f = f || {};
        let t = at2;
        for (let i = 0; i < ids.length - 1; i++) {
          const fwd = edges[ids[i] + ">" + ids[i + 1]];
          const back = edges[ids[i + 1] + ">" + ids[i]];
          if (!fwd && !back) throw new Error("TTM.flow: no edge between " + ids[i] + " and " + ids[i + 1]);
          t = packet(tl, (fwd || back).path, t, Object.assign({}, f, { reverse: !fwd, hit: nodes[ids[i + 1]].el }));
          t += f.gap != null ? f.gap : 0.05;
        }
        return t;
      },
      /** Light a chain of nodes and the edges between them, one after another (pipelines going green). */
      cascade(tl, ids, at2, c) {
        c = c || "--ok";
        const col = TTMcolor(c, root);
        let t = at2;
        ids.forEach((id, i) => {
          if (i > 0) {
            const E = edges[ids[i - 1] + ">" + id] || edges[id + ">" + ids[i - 1]];
            if (E) { tl.to(E.path, { stroke: col, duration: 0.15 }, t - 0.1); tl.to(E.head, { fill: col, duration: 0.15 }, t - 0.05); }
          }
          tl.to(nodes[id].el, { "--state": col, duration: 0.2, ease: "power2.out" }, t);
          pulse(tl, nodes[id].el, t + 0.03, { scale: 1.05 });
          cue(null, t, i === ids.length - 1 ? "ding" : "tick", { gain: i === ids.length - 1 ? 0 : -3 });
          t += 0.18;
        });
        return t;
      },
      /** Set an edge's colour (e.g. failure) */
      tint(tl, a, b, at2, c, opt) {
        const E = edges[a + ">" + b];
        const color = TTMcolor(c, root);
        tl.to([E.path], { stroke: color, duration: 0.1 }, at2);
        tl.to([E.head], { fill: color, duration: 0.1 }, at2);
        if (opt && opt.dim) tl.to([E.path, E.head], { opacity: 0.3, duration: 0.2 }, at2 + 0.1);
        return at2 + 0.1;
      },
    };
    return api;
  }

  /** Move a glowing dot (with a short tail) along an SVG path. Returns arrival time. */
  function packet(tl, path, at, o) {
    o = o || {};
    const p = q(path);
    const svg = p.ownerSVGElement;
    const len = p.getTotalLength();
    const speed = o.speed || 650; // px per second
    const dur = o.dur || Math.max(0.35, len / speed);
    const r = o.size || 11;
    const color = o.color ? TTMcolor(o.color, p) : null;
    const tail = o.tail != null ? o.tail : 3;
    const dots = [];
    for (let i = tail; i >= 0; i--) {
      const c = svgEl("circle", { class: "ttm-packet", r: i === 0 ? r : r * (1 - i * 0.18), cx: -100, cy: -100 }, svg);
      if (color) c.style.fill = color;
      if (o.square && i === 0) { c.setAttribute("r", r * 0.9); }
      dots.push({ c, lag: i * 0.045, base: i === 0 ? 1 : [0, 0.6, 0.35, 0.15][i] || 0.1 });
    }
    const prog = { t: 0 };
    const place = () => {
      dots.forEach((d) => {
        let u = (prog.t - d.lag) / dur;
        u = Math.min(1, Math.max(0, u));
        const along = o.reverse ? 1 - u : u;
        const pt = p.getPointAtLength(along * len);
        d.c.setAttribute("cx", pt.x); d.c.setAttribute("cy", pt.y);
        const live = prog.t > d.lag && prog.t <= dur + 0.08;
        d.c.style.opacity = live ? d.base : 0;
      });
    };
    dots.forEach((d) => { d.c.style.opacity = 0; });
    tl.fromTo(prog, { t: 0 }, { t: dur + 0.2, duration: dur + 0.2, ease: "none", onUpdate: place, immediateRender: false }, at);
    if (o.hit) { pulse(tl, o.hit, at + dur - 0.02, { scale: 1.06 }); cue(o, at + dur - 0.02, "tick", { gain: -2 }); }
    return at + dur;
  }

  g.TTM = { cues: CUES, cue: (t, sfx, extra) => cue(null, t, sfx, extra), EASE, rng, q, qa, reveal, hide, words, type, stream, pulse, focus, unfocus, glitch, fail, ok,
    count, swap, highlight, color, flash, drift, enter, exit, zoom, dive, home, diagram, packet };
})(window);
