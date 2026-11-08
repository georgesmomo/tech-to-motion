#!/usr/bin/env node
// tech-to-motion CLI: setup, new project, checks, stills, sound, renders, verification.
// Usage: node ttm.mjs <command> [dir] [options]
//   doctor                      check Node, fonts, toolchain
//   setup                       install the pinned toolchain once (~/.cache/tech-to-motion)
//   new <dir> [--ratio 16:9|9:16|1:1|4:5] [--look blueprint|terminal|neon|paper] [--scenes 5]
//   sync [dir]                  rebuild index.html from project.json (run by every command below)
//   check [dir]                 lint + runtime/layout/contrast checks, short summary
//   stills [dir] [--at 1,3.5]   still frames + contact sheet for visual QA
//   sfx [dir]                   cues.json -> assets/audio/sfx.wav
//   draft [dir]                 fast low-quality MP4 with sound, verified
//   final [dir] [--music f.mp3] [--name file]  delivery MP4, loudness-normalised, poster, verified
//   verify <file.mp4> [--duration 30]
//   frames <file.mp4> --at 1,4  extract frames from a rendered video
//   icon <slug> [slug...]       tech logo path + colour (Simple Icons, CC0)

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCues, SFX_TYPES } from "./sfx.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = resolve(HERE, "..");
const TC_VERSION = "1";
const PINS = {
  hyperframes: "0.9.23",
  "ffmpeg-static": "5.3.0",
  "ffprobe-static": "3.1.0",
  gsap: "3.15.0",
  "simple-icons": "16.37.0",
  "puppeteer-core": "25.16.0",
};
const TC = process.env.TTM_HOME || join(homedir(), ".cache", "tech-to-motion", "tc" + TC_VERSION);
const RATIOS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const LOOKS = ["blueprint", "terminal", "neon", "paper"];

// ---------- helpers ----------

const args = process.argv.slice(2);
const cmd = args[0];
function opt(name, def) {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
}
function flag(name) { return args.includes("--" + name); }
function positional(n) {
  const out = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) { if (args[i + 1] && !args[i + 1].startsWith("--")) i++; continue; }
    out.push(args[i]);
  }
  return out[n];
}
function die(msg) { console.error("✗ " + msg); process.exit(1); }
function say(msg) { console.log(msg); }

function tcRequire() {
  if (!existsSync(join(TC, "node_modules", "hyperframes"))) die(`Toolchain missing. Run: node ${join(HERE, "ttm.mjs")} setup`);
  return createRequire(join(TC, "package.json"));
}
function bins() {
  const req = tcRequire();
  return { ffmpeg: req("ffmpeg-static"), ffprobe: req("ffprobe-static").path,
    hf: join(TC, "node_modules", ".bin", platform() === "win32" ? "hyperframes.cmd" : "hyperframes") };
}
function env() {
  const b = bins();
  return Object.assign({}, process.env, {
    HYPERFRAMES_FFMPEG_PATH: b.ffmpeg, HYPERFRAMES_FFPROBE_PATH: b.ffprobe,
    HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", HYPERFRAMES_SKIP_SKILLS: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1",
  });
}
// Windows: only .cmd shims need a shell, and then every argument must be quoted by hand.
function winQuote(a) { return /[\s"&|<>^()]/.test(a) ? '"' + String(a).replace(/"/g, '\\"') + '"' : a; }
function run(bin, argv, o = {}) {
  const isCmd = platform() === "win32" && /\.cmd$/i.test(bin);
  const r = isCmd
    ? spawnSync(winQuote(bin), argv.map(winQuote), Object.assign({ encoding: "utf8", env: env(), maxBuffer: 1 << 28, shell: true }, o))
    : spawnSync(bin, argv, Object.assign({ encoding: "utf8", env: env(), maxBuffer: 1 << 28 }, o));
  if (r.error) die(`${basename(bin)} failed to start: ${r.error.message}`);
  return r;
}
function hf(dir, argv, o = {}) { return run(bins().hf, argv, Object.assign({ cwd: dir }, o)); }

function projectDir(p) {
  const d = resolve(p || ".");
  if (!existsSync(join(d, "project.json"))) die(`No project.json in ${d}. Create one with: node ${join(HERE, "ttm.mjs")} new <dir>`);
  return d;
}
function readProject(d) {
  const p = JSON.parse(readFileSync(join(d, "project.json"), "utf8"));
  if (!RATIOS[p.ratio]) die(`project.json: ratio must be one of ${Object.keys(RATIOS).join(", ")}`);
  if (!LOOKS.includes(p.look)) die(`project.json: look must be one of ${LOOKS.join(", ")}`);
  if (!Array.isArray(p.scenes) || !p.scenes.length) die("project.json: scenes must be a non-empty array");
  const seen = {};
  p.scenes.forEach((s, i) => {
    if (!/^s\d+$/.test(s.id)) die(`project.json: scene ${i} id "${s.id}" must look like s1, s2...`);
    if (seen[s.id]) die(`project.json: duplicate scene id ${s.id}`);
    seen[s.id] = 1;
    if (typeof s.duration !== "number" || !(s.duration > 0)) die(`project.json: scene ${s.id} needs a numeric duration > 0 (got ${JSON.stringify(s.duration)})`);
  });
  if (p.fps != null && ![24, 25, 30, 50, 60].includes(p.fps)) die("project.json: fps must be 24, 25, 30, 50 or 60");
  if (p.sound != null && !["auto", "manual", "none"].includes(p.sound)) die('project.json: sound must be "auto", "manual" or "none"');
  return p;
}
function totalDuration(p) { return +p.scenes.reduce((a, s) => a + s.duration, 0).toFixed(3); }

// ---------- commands ----------

function doctor() {
  const major = +process.versions.node.split(".")[0];
  say(`${major >= 22 ? "✓" : "✗"} Node ${process.versions.node}${major >= 22 ? "" : " (need 22 or later)"}`);
  if (platform() === "linux") {
    const r = spawnSync("fc-list", [], { encoding: "utf8" });
    const n = r.stdout ? r.stdout.trim().split("\n").filter(Boolean).length : 0;
    say(`${n > 0 ? "✓" : "✗"} System fonts: ${n}${n > 0 ? "" : " — install one (e.g. apt install fonts-dejavu-core), or text can render blank"}`);
  }
  const ok = existsSync(join(TC, "node_modules", "hyperframes"));
  say(`${ok ? "✓" : "✗"} Toolchain ${ok ? "ready" : "not installed"} at ${TC}`);
  if (ok) {
    const r = run(bins().hf, ["doctor"], { cwd: TC });
    const out = (r.stdout || "") + (r.stderr || "");
    out.split("\n").filter((l) => /ffmpeg|ffprobe|chrome|node/i.test(l)).slice(0, 6).forEach((l) => say("  " + l.trim()));
    say("  ffmpeg: " + bins().ffmpeg);
  }
  if (major < 22) process.exit(1);
}

function setup() {
  const major = +process.versions.node.split(".")[0];
  if (major < 22) die(`Node ${process.versions.node} found; HyperFrames needs Node 22+. Install it from nodejs.org or with nvm, then retry.`);
  mkdirSync(TC, { recursive: true });
  writeFileSync(join(TC, "package.json"), JSON.stringify({ name: "tech-to-motion-toolchain", private: true, dependencies: PINS }, null, 2));
  say(`Installing toolchain in ${TC} (one time, ~1-2 min)...`);
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: TC, stdio: "inherit", shell: platform() === "win32" });
  if (r.status !== 0) die("npm install failed (see above).");
  run(bins().hf, ["telemetry", "disable"], { cwd: TC });
  say("✓ Toolchain ready: hyperframes " + PINS.hyperframes + ", ffmpeg (static), gsap " + PINS.gsap + ", simple-icons");
  say("  The first render downloads a headless Chrome (~260 MB) into ~/.cache/hyperframes.");
}

function sceneSkeleton(id, W, H, duration, first, last) {
  return `<template>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    <div class="ttm-scene">
      <div class="ttm-grid" id="${id}-grid"></div>
      <div class="ttm-stage" id="${id}-stage">
        <div class="ttm-camera" id="${id}-cam">
          <h1 class="ttm-title ttm-center" id="${id}-title" style="top: ${Math.round(H * 0.42)}px">Scene ${id}</h1>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function () {
      const D = ${duration}; // kept in sync with project.json by ttm
      const tl = gsap.timeline({ paused: true });
      TTM.drift(tl, "#${id}-grid", 0, D);
      ${first ? "" : `TTM.enter(tl, "#${id}-stage", 0, "whip");
      `}// First reveal at 0-0.05 s so the stage never arrives empty.
      let t = TTM.reveal(tl, "#${id}-title", ${first ? "0" : "0.05"}, { kind: "${first ? "settle" : "rise"}" });
      ${last ? "// Last scene: no exit, the takeaway holds to the end." : `TTM.exit(tl, "#${id}-stage", D, "whip");`}
      window.__timelines["${id}"] = tl;
    })();
  </script>
</template>
`;
}

function newProject() {
  const dir = positional(0);
  if (!dir) die("Usage: new <dir> [--ratio 16:9] [--look blueprint] [--scenes 5]");
  const d = resolve(dir);
  if (existsSync(join(d, "project.json"))) die(`${d} already has a project.json`);
  const ratio = opt("ratio", "16:9"), look = opt("look", "blueprint"), n = +opt("scenes", "5");
  if (!RATIOS[ratio]) die(`--ratio must be one of ${Object.keys(RATIOS).join(", ")}`);
  if (!LOOKS.includes(look)) die(`--look must be one of ${LOOKS.join(", ")}`);
  const req = tcRequire();
  mkdirSync(join(d, "compositions"), { recursive: true });
  mkdirSync(join(d, "assets", "vendor"), { recursive: true });
  mkdirSync(join(d, "assets", "ttm"), { recursive: true });
  mkdirSync(join(d, "assets", "audio"), { recursive: true });
  copyFileSync(join(dirname(req.resolve("gsap/package.json")), "dist", "gsap.min.js"), join(d, "assets", "vendor", "gsap.min.js"));
  copyFileSync(join(SKILL, "kit", "ttm.js"), join(d, "assets", "ttm", "ttm.js"));
  copyFileSync(join(SKILL, "kit", "ttm.css"), join(d, "assets", "ttm", "ttm.css"));
  const scenes = [];
  for (let i = 1; i <= n; i++) scenes.push({ id: "s" + i, duration: 4, beat: "" });
  const project = { title: basename(d), ratio, look, fps: 30, sound: "auto", music: null, scenes };
  writeFileSync(join(d, "project.json"), JSON.stringify(project, null, 2) + "\n");
  writeFileSync(join(d, "cues.json"), "[]\n");
  writeFileSync(join(d, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2) + "\n");
  writeFileSync(join(d, "meta.json"), JSON.stringify({ id: basename(d), name: basename(d) }, null, 2) + "\n");
  for (const f of ["storyboard.md", "facts.md"]) copyFileSync(join(SKILL, "template", f), join(d, f));
  sync(d);
  say(`✓ Project created: ${d}`);
  say(`  ${ratio} ${RATIOS[ratio].join("x")}, look "${look}", ${n} scenes of 4 s (edit project.json, then each compositions/sN.html)`);
}

function sync(d) {
  const p = readProject(d);
  const [W, H] = RATIOS[p.ratio];
  const total = totalDuration(p);
  let start = 0;
  const hosts = p.scenes.map((s) => {
    const file = join(d, "compositions", s.id + ".html");
    const idx = p.scenes.indexOf(s);
    if (!existsSync(file)) writeFileSync(file, sceneSkeleton(s.id, W, H, s.duration, idx === 0, idx === p.scenes.length - 1));
    else {
      // Keep the scene's duration constant equal to project.json, and its size equal to the ratio.
      let src = readFileSync(file, "utf8");
      if (!/const D = [\d.]+;/.test(src)) say(`  ⚠ ${s.id}.html: no "const D = <seconds>;" line, so its duration is not synced`);
      const next = src.replace(/const D = [\d.]+;/, `const D = ${s.duration};`)
        .replace(/(data-composition-id="s\d+" data-width=")\d+(" data-height=")\d+/, `$1${W}$2${H}`);
      if (next !== src) writeFileSync(file, next);
    }
    const h = `      <div id="${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html"
        data-start="${+start.toFixed(3)}" data-duration="${s.duration}" data-track-index="1" data-track-kind="graphics"
        data-width="${W}" data-height="${H}"></div>`;
    start += s.duration;
    return h;
  });
  // Restore generated files (useful for a project copied without them).
  for (const sub of ["compositions", "assets/vendor", "assets/ttm", "assets/audio"]) mkdirSync(join(d, sub), { recursive: true });
  const gsapDst = join(d, "assets", "vendor", "gsap.min.js");
  if (!existsSync(gsapDst)) {
    const req = tcRequire();
    copyFileSync(join(dirname(req.resolve("gsap/package.json")), "dist", "gsap.min.js"), gsapDst);
  }
  if (!existsSync(join(d, "hyperframes.json"))) writeFileSync(join(d, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2) + "\n");
  // Keep the kit copy current with the skill version, then inline its CSS (fonts must be visible
  // in the HTML for the render compiler to embed them).
  for (const f of ["ttm.js", "ttm.css"]) {
    const src = join(SKILL, "kit", f), dst = join(d, "assets", "ttm", f);
    if (existsSync(src) && (!existsSync(dst) || readFileSync(src, "utf8") !== readFileSync(dst, "utf8"))) copyFileSync(src, dst);
  }
  const css = readFileSync(join(d, "assets", "ttm", "ttm.css"), "utf8");
  const icons = existsSync(join(d, "assets", "ttm", "icons.js")) ? `\n    <script src="assets/ttm/icons.js"></script>` : "";
  const hasSfx = p.sound !== "none" && existsSync(join(d, "assets", "audio", "sfx.wav"));
  const audio = hasSfx ? `\n      <audio id="ttm-sfx" src="assets/audio/sfx.wav" data-start="0" data-duration="${total}" data-track-index="2" data-volume="1"></audio>` : "";
  const html = `<!doctype html>
<!-- Generated by tech-to-motion from project.json. Edit project.json and compositions/, not this file. -->
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="assets/vendor/gsap.min.js"></script>
    <script src="assets/ttm/ttm.js"></script>${icons}
    <style>
${css}
      html, body { width: ${W}px; height: ${H}px; }
    </style>
  </head>
  <body data-look="${p.look}" data-ratio="${p.ratio.replace(":", "x")}">
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-fps="${p.fps || 30}" data-width="${W}" data-height="${H}">
${hosts.join("\n")}${audio}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
  writeFileSync(join(d, "index.html"), html);
  return p;
}

// Findings caused by the kit's own layers on purpose (oversized drifting grid, full-frame scene
// background, stage moving during transitions). Hidden from the summary, kept in the JSON report.
function expected(f) {
  const where = String(f.selector || f.elementId || f.target || "");
  if (f.code === "container_overflow" && /-(grid|stage|cam)\b/.test(where)) return true;
  if (f.code === "canvas_covered" && /^#s\d+ > div:nth-of-type\(1\) > div:nth-of-type\(1\)$/.test(where)) return true;
  return false;
}

function summarizeFindings(section, name, max = 12) {
  if (!section) return [];
  const out = [];
  (section.findings || []).filter((f) => !expected(f) && (f.severity || "") !== "info").slice(0, max).forEach((f) => {
    const sev = f.severity || f.level || (f.error ? "error" : "warning");
    const where = f.file || f.selector || f.elementId || f.target || "";
    const at = f.time != null ? ` @${f.time}s` : f.at != null ? ` @${f.at}s` : "";
    out.push(`  ${sev === "error" ? "✗" : "⚠"} [${name}] ${f.code || f.rule || f.kind || ""} ${where}${at} — ${f.message || f.detail || ""}`.replace(/\s+/g, " "));
  });
  return out;
}

async function check() {
  const d = projectDir(positional(0));
  const p = sync(d);
  const noSfxYet = p.sound !== "none" && !existsSync(join(d, "assets", "audio", "sfx.wav"));
  const lint = hf(d, ["lint", "--json"]);
  let lintJson = null;
  try { lintJson = JSON.parse(lint.stdout.slice(lint.stdout.indexOf("{"))); } catch {}
  const r = hf(d, ["check", "--json"]);
  let j = null;
  try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch {}
  if (!j) { say((r.stdout || "") + (r.stderr || "")); die("check did not return JSON"); }
  const sections = ["lint", "runtime", "layout", "motion", "contrast", "craft", "audio"];
  let errors = 0, warnings = 0;
  const lines = [];
  sections.forEach((s) => {
    const sec = j[s];
    if (!sec) return;
    if (noSfxYet && sec.findings) sec.findings = sec.findings.filter((f) => !["film_silent", "audio_none"].includes(f.code));
    (sec.findings || []).forEach((f) => {
      if (expected(f) || f.severity === "info") return;
      const sev = f.severity || f.level || (f.error ? "error" : "warning");
      if (sev === "error") errors++; else warnings++;
    });
    lines.push(...summarizeFindings(sec, s));
  });
  if (lintJson && !j.lint) {
    (lintJson.findings || []).forEach((f) => { if (f.severity === "error") errors++; else if (f.severity !== "info") warnings++; });
    lines.push(...summarizeFindings(lintJson, "lint"));
  }
  let safe = [];
  try { safe = await safeAreaCheck(d, p); } catch (e) { say("  ⚠ safe-area check skipped: " + e.message); }
  errors += safe.length;
  say(`${errors ? "✗" : "✓"} check: ${errors} error(s), ${warnings} warning(s)`);
  lines.forEach((l) => say(l));
  safe.slice(0, 15).forEach((l) => say("  ✗ [safe-area] " + l));
  if (noSfxYet) say("  (sound is added at draft/final: no audio warnings yet)");
  writeFileSync(join(d, ".ttm-check.json"), JSON.stringify(j, null, 2));
  say(`  full report: ${join(d, ".ttm-check.json")}`);
  if (errors) process.exitCode = 1;
}

function stills() {
  const d = projectDir(positional(0));
  const p = sync(d);
  // Frame 0 (the hook / thumbnail), one still per scene at 65 % of its length, plus any --at.
  let s0 = 0; const ts = [0];
  p.scenes.forEach((s) => { ts.push(+(s0 + s.duration * 0.65).toFixed(2)); s0 += s.duration; });
  const extra = opt("at", null);
  if (extra) extra.split(",").map(Number).filter((x) => !isNaN(x)).forEach((x) => ts.push(x));
  if (flag("only") && extra) ts.splice(0, ts.length, ...extra.split(",").map(Number));
  const at = [...new Set(ts)].sort((a, b) => a - b).join(",");
  const out = join(d, ".ttm-stills");
  rmSync(out, { recursive: true, force: true });
  // Draw the platform safe area on the stills (dashed magenta box); removed right after.
  const html = readFileSync(join(d, "index.html"), "utf8");
  if (!flag("no-safe")) writeFileSync(join(d, "index.html"), html.replace("<body ", "<body data-safe-overlay ")); 
  let r;
  try { r = hf(d, ["snapshot", "--at", at, "-o", out, "--json"]); } finally { writeFileSync(join(d, "index.html"), html); }
  if (r.status !== 0) { say((r.stdout || "") + (r.stderr || "")); die("snapshot failed"); }
  const files = existsSync(out) ? readdirSync(out).filter((f) => /\.(png|jpe?g)$/.test(f)).sort() : [];
  say(`✓ ${files.length} image(s) in ${out}`);
  files.forEach((f) => say("  " + join(out, f)));
  say("  Start with the contact sheet(s), then open single frames for detail. The dashed magenta box");
  say("  is the platform safe area (stills only, never rendered): text must stay inside it.");
}

function browserPath() {
  if (process.env.HYPERFRAMES_BROWSER_PATH && existsSync(process.env.HYPERFRAMES_BROWSER_PATH)) return process.env.HYPERFRAMES_BROWSER_PATH;
  const r = run(bins().hf, ["browser", "path"], { cwd: TC });
  const line = ((r.stdout || "") + "\n" + (r.stderr || "")).split("\n").map((l) => l.trim()).find((l) => l && existsSync(l));
  if (line) return line;
  for (const c of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]) if (existsSync(c)) return c;
  const e = run(bins().hf, ["browser", "ensure"], { cwd: TC });
  const l2 = ((e.stdout || "") + "\n" + (e.stderr || "")).split("\n").map((l) => l.trim()).find((l) => l && existsSync(l));
  if (l2) return l2;
  die("No Chrome found for cue extraction. Run: npx hyperframes browser ensure");
}

// Text that leaves the platform safe area, measured in headless Chrome at a few moments of
// each scene (between entrance and exit). Fonts may differ slightly from the render: 8 px slack.
async function safeAreaCheck(d, p) {
  const req = tcRequire();
  const puppeteer = req("puppeteer-core");
  const [W, H] = RATIOS[p.ratio];
  const head = harnessHead(d);
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const found = [];
  let fontsOk = true;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    let start = 0;
    for (const s of p.scenes) {
      await page.setContent(sceneHarness(d, p, s, head, W, H), { waitUntil: "load" });
      const ok = await page.evaluate(async () => {
        const specs = ["900 40px Inter", "700 40px Inter", "400 40px Inter", "700 40px 'IBM Plex Mono'", "400 40px 'IBM Plex Mono'",
          "800 40px 'JetBrains Mono'", "400 40px 'JetBrains Mono'", "800 40px Outfit", "700 40px 'Space Mono'", "700 40px 'Playfair Display'"];
        const t = new Promise((r) => setTimeout(() => r("timeout"), 8000));
        await Promise.race([Promise.all(specs.map((f) => document.fonts.load(f))), t]);
        return document.fonts.check("900 40px Inter");
      });
      if (!ok) fontsOk = false;
      const res = await page.evaluate((id, D) => {
        const tl = window.__timelines && window.__timelines[id];
        if (!tl) return [];
        const cs = getComputedStyle(document.body);
        const n = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
        const box = { l: n("--safe-l"), r: innerWidth - n("--safe-r"), t: n("--safe-t"), b: innerHeight - n("--safe-b") };
        const out = [];
        const times = [0.35, 0.6, 0.85].map((f) => +(D * f).toFixed(2));
        if (id === "s1") times.unshift(0);
        for (const t of times) {
          tl.seek(t, false);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const txt = node.textContent.trim();
            if (!txt || node.parentElement.closest("script,style,.ttm-grid")) continue;
            let el = node.parentElement, op = 1;
            while (el && el !== document.body) { op *= parseFloat(getComputedStyle(el).opacity); el = el.parentElement; }
            if (op < 0.2) continue;
            const r = document.createRange(); r.selectNodeContents(node);
            const rect = r.getBoundingClientRect();
            if (!rect.width) continue;
            const slack = 4;
            const sides = [];
            if (rect.left < box.l - slack) sides.push("left " + Math.round(box.l - rect.left) + "px");
            if (rect.right > box.r + slack) sides.push("right " + Math.round(rect.right - box.r) + "px");
            if (rect.top < box.t - slack) sides.push("top " + Math.round(box.t - rect.top) + "px");
            if (rect.bottom > box.b + slack) sides.push("bottom " + Math.round(rect.bottom - box.b) + "px");
            if (sides.length) out.push({ t, text: txt.slice(0, 40), sides: sides.join(", ") });
          }
        }
        const seen = {};
        return out.filter((x) => (seen[x.text] ? false : (seen[x.text] = true)));
      }, s.id, s.duration);
      res.forEach((x) => found.push(`${s.id} @${(start + x.t).toFixed(2)}s "${x.text}" outside the safe area (${x.sides})`));
      start += s.duration;
    }
  } finally { await browser.close(); }
  if (!fontsOk) say("  ⚠ safe-area check ran without web fonts (offline?): widths are approximate");
  return found;
}

// The same Google Fonts the render embeds, so measured text widths match the video.
const FONTS_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900' +
  '&family=IBM+Plex+Mono:wght@400;700&family=JetBrains+Mono:wght@400;700;800&family=Outfit:wght@400;700;800' +
  '&family=Space+Mono:wght@400;700&family=Playfair+Display:wght@700&display=block">';
function harnessHead(d) {
  return FONTS_LINK + `<style>${readFileSync(join(d, "assets", "ttm", "ttm.css"), "utf8")}</style>` +
    `<script>${readFileSync(join(d, "assets", "vendor", "gsap.min.js"), "utf8")}</script>` +
    `<script>${readFileSync(join(d, "assets", "ttm", "ttm.js"), "utf8")}</script>` +
    (existsSync(join(d, "assets", "ttm", "icons.js")) ? `<script>${readFileSync(join(d, "assets", "ttm", "icons.js"), "utf8")}</script>` : "");
}
function sceneHarness(d, p, s, head, W, H) {
  const src = readFileSync(join(d, "compositions", s.id + ".html"), "utf8");
  const m = src.match(/<template>([\s\S]*)<\/template>/);
  const inner = m ? m[1] : src;
  return `<!doctype html><html><head><meta charset="utf-8">${head}<style>html,body{width:${W}px;height:${H}px;margin:0}</style></head>` +
    `<body data-look="${p.look}" data-ratio="${p.ratio.replace(":", "x")}"><script>window.__timelines={};</script>${inner}</body></html>`;
}

// Run each scene once in headless Chrome and collect the cues the kit logged.
async function autoCues(d, p) {
  const req = tcRequire();
  const puppeteer = req("puppeteer-core");
  const [W, H] = RATIOS[p.ratio];
  const head = `<style>${readFileSync(join(d, "assets", "ttm", "ttm.css"), "utf8")}</style>` +
    `<script>${readFileSync(join(d, "assets", "vendor", "gsap.min.js"), "utf8")}</script>` +
    `<script>${readFileSync(join(d, "assets", "ttm", "ttm.js"), "utf8")}</script>` +
    (existsSync(join(d, "assets", "ttm", "icons.js")) ? `<script>${readFileSync(join(d, "assets", "ttm", "icons.js"), "utf8")}</script>` : "");
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const out = [];
  const errors = [];
  const problems = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    page.on("pageerror", (e) => errors.push(String(e.message || e)));
    let start = 0;
    for (const s of p.scenes) {
      const src = readFileSync(join(d, "compositions", s.id + ".html"), "utf8");
      const m = src.match(/<template>([\s\S]*)<\/template>/);
      const inner = m ? m[1] : src;
      const html = `<!doctype html><html><head><meta charset="utf-8">${head}<style>html,body{width:${W}px;height:${H}px}</style></head>` +
        `<body data-look="${p.look}" data-ratio="${p.ratio.replace(":", "x")}"><script>window.__timelines={};</script>${inner}</body></html>`;
      errors.length = 0;
      await page.setContent(html, { waitUntil: "load" });
      const info = await page.evaluate((id) => ({
        cues: window.TTM ? window.TTM.cues.slice() : [],
        tl: !!(window.__timelines && window.__timelines[id]),
        dur: window.__timelines && window.__timelines[id] ? window.__timelines[id].duration() : 0,
      }), s.id);
      if (errors.length) problems.push(`${s.id}.html throws: ${errors[0]}`);
      else if (!info.tl) problems.push(`${s.id}.html does not register window.__timelines["${s.id}"]`);
      else if (info.dur > s.duration + 0.05) say(`  ⚠ ${s.id}: motion lasts ${info.dur.toFixed(2)} s but the scene is ${s.duration} s: the end is cut`);
      info.cues.forEach((c) => { if (c.t < s.duration) out.push(Object.assign({}, c, { t: +(c.t + start).toFixed(3), scene: s.id })); });
      start += s.duration;
    }
  } finally { await browser.close(); }
  if (problems.length) { problems.forEach((m) => say("  ✗ " + m)); die("Fix the scene script(s) above before rendering."); }
  return out;
}

const PRIORITY = { impact: 9, error: 8, ding: 7, glitch: 6, riser: 6, swell: 5, whoosh: 5, typing: 4, pop: 3, tick: 2, click: 1 };
function thin(cues) {
  const sorted = cues.slice().sort((a, b) => a.t - b.t || (PRIORITY[b.sfx] || 0) - (PRIORITY[a.sfx] || 0));
  const kept = [];
  for (const c of sorted) {
    if (c.sfx === "whoosh" && kept.some((k) => k.sfx === "whoosh" && Math.abs(k.t - c.t) < 0.5)) continue;
    if ((PRIORITY[c.sfx] || 0) <= 3 && kept.some((k) => Math.abs(k.t - c.t) < 0.14)) continue;
    if (c.sfx === "typing" && kept.some((k) => k.sfx === "typing" && k.t + (k.dur || 1) > c.t)) continue;
    kept.push(c);
  }
  return kept;
}

async function sfx(dPath) {
  const d = projectDir(dPath || positional(0));
  const p = sync(d);
  const manual = existsSync(join(d, "cues.json")) ? JSON.parse(readFileSync(join(d, "cues.json"), "utf8")) : [];
  const total = totalDuration(p);
  const wav = join(d, "assets", "audio", "sfx.wav");
  let cues = manual.slice();
  if (p.sound !== "manual" && p.sound !== "none") {
    const auto = await autoCues(d, p);
    cues = thin(auto.concat(manual.map((c) => Object.assign({ manual: true }, c))));
    writeFileSync(join(d, "cues.auto.json"), JSON.stringify(cues, null, 1) + "\n");
  }
  if (p.sound === "none" || !cues.length) {
    if (existsSync(wav)) rmSync(wav);
    say(p.sound === "none" ? "✓ sound: none (project.json)" : "⚠ No sound cues: the video will be silent.");
    sync(d);
    return;
  }
  const res = renderCues(cues, total, wav, 7);
  res.problems.forEach((m) => say("  ✗ " + m));
  if (res.problems.length) die("Fix cues.json (types: " + SFX_TYPES.join(", ") + ")");
  const by = {};
  cues.forEach((c) => { by[c.sfx] = (by[c.sfx] || 0) + 1; });
  say(`✓ sfx.wav: ${cues.length} sounds over ${total}s (${Object.keys(by).map((k) => by[k] + " " + k).join(", ")})`);
  if (cues.length / total > 2) say("  ⚠ more than 2 sounds per second: busy. Mute some helpers with { sfx: false }.");
  sync(d);
}

function probe(file) {
  const r = run(bins().ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate", "-of", "json", file]);
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function verify(file, expect, expectAudio) {
  if (!existsSync(file)) die("No file " + file);
  const j = probe(file);
  if (!j) die("ffprobe could not read " + file);
  const v = (j.streams || []).find((s) => s.codec_type === "video");
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  const dur = +(j.format && j.format.duration);
  const problems = [];
  if (!v) problems.push("no video stream");
  if (expectAudio && !a) problems.push("no audio stream (sound is on in project.json: run ttm sfx and check cues)");
  if (expect && Math.abs(dur - expect) > 0.1) problems.push(`duration ${dur.toFixed(2)}s, expected ${expect}s`);
  const ff = bins().ffmpeg;
  const bd = run(ff, ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.4:pix_th=0.03", "-an", "-f", "null", "-"]);
  const blacks = ((bd.stderr || "").match(/black_start:[\d.]+ black_end:[\d.]+/g) || []);
  if (blacks.length) problems.push("black segments: " + blacks.join("; "));
  let vol = null;
  if (a) {
    const vd = run(ff, ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"]);
    const m = (vd.stderr || "").match(/max_volume: (-?[\d.]+) dB/);
    vol = m ? +m[1] : null;
    if (vol != null && vol < -50) problems.push("audio track is silent");
  }
  const size = (statSync(file).size / 1048576).toFixed(1);
  say(`${problems.length ? "✗" : "✓"} ${file}`);
  say(`  ${v ? `${v.codec_name} ${v.width}x${v.height} ${v.r_frame_rate}` : "no video"} · ${dur.toFixed(2)} s · ${a ? `audio ${a.codec_name}${vol != null ? ` (peak ${vol} dB)` : ""}` : "no audio"} · ${size} MB`);
  problems.forEach((m) => say("  ✗ " + m));
  if (problems.length) process.exitCode = 1;
  return problems.length === 0;
}

function render(d, quality, out, extra = []) {
  mkdirSync(dirname(out), { recursive: true });
  say(`Rendering (${quality})...`);
  const t0 = Date.now();
  const r = hf(d, ["render", "--quality", quality, "-o", out, "--quiet", ...extra], { stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0 || !existsSync(out)) {
    say(((r.stdout || "") + (r.stderr || "")).split("\n").slice(-30).join("\n"));
    die("render failed");
  }
  say(`  done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

async function draft() {
  const d = projectDir(positional(0));
  await sfx(d);
  const p = sync(d);
  const out = join(d, "renders", "draft.mp4");
  render(d, "draft", out);
  verify(out, totalDuration(p), p.sound !== "none");
}

async function finalRender() {
  const d = projectDir(positional(0));
  await sfx(d);
  const p = sync(d);
  const total = totalDuration(p);
  const raw = join(d, "renders", ".raw.mp4");
  render(d, "delivery", raw, ["--workers", "1"]);
  const name = opt("name", (p.title || "video").replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase());
  const out = join(d, "renders", name + ".mp4");
  const cliMusic = opt("music", null);
  const music = cliMusic ? resolve(cliMusic) : p.music ? resolve(d, p.music) : null;
  if (music && !existsSync(music)) die(`Music file not found: ${music}`);
  const ff = bins().ffmpeg;
  const hasAudio = !!(probe(raw).streams || []).find((s) => s.codec_type === "audio");
  let argv;
  if (music) {
    const fadeOut = Math.max(0, total - 2);
    const mus = `[1:a]atrim=0:${total},afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2,volume=0.22[m]`;
    argv = hasAudio
      ? ["-y", "-i", raw, "-i", music, "-filter_complex", `${mus};[0:a][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1:LRA=11[a]`, "-map", "0:v", "-map", "[a]"]
      : ["-y", "-i", raw, "-i", music, "-filter_complex", `${mus};[m]loudnorm=I=-14:TP=-1:LRA=11[a]`, "-map", "0:v", "-map", "[a]"];
  } else if (hasAudio) {
    // Effects only: a little quieter than -14 so transients stay comfortable.
    argv = ["-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-map", "0:v", "-map", "0:a"];
  } else {
    argv = ["-y", "-i", raw, "-map", "0:v"];
  }
  argv = twoPassLoudnorm(ff, argv);
  argv.push("-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(total), out);
  const r = run(ff, argv);
  if (r.status !== 0) { say((r.stderr || "").split("\n").slice(-15).join("\n")); die("audio finishing failed"); }
  rmSync(raw, { force: true });
  // Poster frame from the payoff (last scene, middle).
  const last = p.scenes[p.scenes.length - 1];
  const posterAt = Math.max(0, total - last.duration / 2);
  run(ff, ["-y", "-v", "error", "-ss", String(posterAt), "-i", out, "-frames:v", "1", join(d, "renders", name + "-poster.png")]);
  verify(out, total, p.sound !== "none" || !!music);
  say(`  poster: ${join(d, "renders", name + "-poster.png")}`);
}

function frames() {
  const file = resolve(positional(0) || "");
  if (!existsSync(file)) die("Usage: frames <file.mp4> --at 1.5,4,9");
  const at = (opt("at", "1") || "1").split(",").map(Number);
  const out = join(dirname(file), "frames");
  mkdirSync(out, { recursive: true });
  const files = [];
  at.forEach((t) => {
    const f = join(out, `frame-${t}s.png`);
    run(bins().ffmpeg, ["-y", "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", f]);
    if (existsSync(f)) files.push(f);
    say("  " + f);
  });
  if (files.length > 1) {
    // One sheet, 3 per row, each 640 px wide.
    const per = 3, rows = Math.ceil(files.length / per);
    const inputs = files.flatMap((f) => ["-i", f]);
    let fc = files.map((_, i) => `[${i}]scale=640:-2[s${i}]`).join(";");
    const blank = [];
    for (let i = files.length; i < rows * per; i++) { fc += `;[s0]drawbox=c=black:t=fill[s${i}]`; blank.push(i); }
    const rowLabels = [];
    for (let r = 0; r < rows; r++) { fc += `;${Array.from({ length: per }, (_, k) => `[s${r * per + k}]`).join("")}hstack=${per}[r${r}]`; rowLabels.push(`[r${r}]`); }
    fc += rows > 1 ? `;${rowLabels.join("")}vstack=${rows}[out]` : `;[r0]null[out]`;
    const sheet = join(out, "sheet.png");
    // drawbox on a reused label needs a split; simpler: pad missing tiles with the first frame darkened.
    const vs = (probe(file).streams || []).find((x) => x.codec_type === "video") || { width: 16, height: 9 };
    const th = Math.round((640 * vs.height) / vs.width / 2) * 2;
    fc = fc.replace(/;\[s0\]drawbox=c=black:t=fill\[s(\d+)\]/g, (m0, i) => `;color=c=black:s=640x${th}:d=1[s${i}]`);
    run(bins().ffmpeg, ["-y", "-v", "error", ...inputs, "-filter_complex", fc, "-map", "[out]", "-frames:v", "1", sheet]);
    if (existsSync(sheet)) say("  sheet: " + sheet);
  }
}

// Measure with a first loudnorm pass, then apply the measured values linearly, so sparse
// effects tracks are not pumped by the one-pass dynamic mode.
function twoPassLoudnorm(ff, argv) {
  const s = argv.join("\u0000");
  const m = /loudnorm=I=(-?[\d.]+):TP=(-?[\d.]+):LRA=([\d.]+)/.exec(s);
  if (!m) return argv;
  const target = `loudnorm=I=${m[1]}:TP=${m[2]}:LRA=${m[3]}`;
  const measureArgv = argv.map((a) => a.replace(target, target + ":print_format=json"));
  const probeArgv = [];
  for (let i = 0; i < measureArgv.length; i++) {
    if (measureArgv[i] === "-y") continue;
    if (measureArgv[i] === "-map" && measureArgv[i + 1] === "0:v") { i++; continue; }
    probeArgv.push(measureArgv[i]);
  }
  const r = run(ff, ["-hide_banner", ...probeArgv, "-f", "null", "-"]);
  const j = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(r.stderr || "");
  if (!j) return argv;
  let mv;
  try { mv = JSON.parse(j[0]); } catch { return argv; }
  if (!isFinite(+mv.input_i)) return argv;
  const applied = `${target}:measured_I=${mv.input_i}:measured_TP=${mv.input_tp}:measured_LRA=${mv.input_lra}:measured_thresh=${mv.input_thresh}:offset=${mv.target_offset}:linear=true`;
  return argv.map((a) => a.replace(target, applied));
}

function icon() {
  const req = tcRequire();
  const si = req("simple-icons");
  const slugs = args.slice(1).filter((a, i, arr) => !a.startsWith("--") && arr[i - 1] !== "--project");
  if (!slugs.length) die("Usage: icon <slug> [slug...] [--project <dir>]   e.g. icon kubernetes postgresql redis --project .");
  const all = Object.values(si).filter((x) => x && x.slug);
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const found = {};
  slugs.forEach((s) => {
    const key = norm(s);
    const hit = all.find((x) => x.slug === key) || all.find((x) => norm(x.title) === key);
    if (!hit) {
      const near = all.filter((x) => x.slug.includes(key) || norm(x.title).includes(key)).slice(0, 6).map((x) => x.slug);
      say(`✗ ${s}: no exact match${near.length ? ` (did you mean: ${near.join(", ")}?)` : ""}. Use a label without icon. AWS, Azure and most Microsoft logos are not in Simple Icons.`);
      return;
    }
    found[hit.slug] = { title: hit.title, color: "#" + hit.hex, path: hit.path };
    say(`✓ ${s} → TTM_ICONS.${hit.slug} (${hit.title}, #${hit.hex})`);
  });
  const proj = opt("project", null);
  if (proj) {
    const d = projectDir(proj);
    const f = join(d, "assets", "ttm", "icons.js");
    let cur = {};
    if (existsSync(f)) { try { cur = JSON.parse(readFileSync(f, "utf8").replace(/^[^{]*/, "").replace(/;\s*$/, "")); } catch {} }
    Object.assign(cur, found);
    writeFileSync(f, "window.TTM_ICONS = " + JSON.stringify(cur) + ";\n");
    sync(d);
    say(`  saved to ${f}: use icon: TTM_ICONS.<slug> in TTM.diagram nodes`);
  } else if (Object.keys(found).length) {
    say("  (add --project <dir> to save them for the scenes)");
  }
}

switch (cmd) {
  case "doctor": doctor(); break;
  case "setup": setup(); break;
  case "new": newProject(); break;
  case "sync": { const d = projectDir(positional(0)); sync(d); say("✓ index.html rebuilt from project.json"); break; }
  case "check": await check(); break;
  case "stills": stills(); break;
  case "sfx": await sfx(); break;
  case "draft": await draft(); break;
  case "final": await finalRender(); break;
  case "verify": verify(resolve(positional(0) || ""), opt("duration") ? +opt("duration") : null, false); break;
  case "icon": icon(); break;
  case "frames": frames(); break;
  default:
    say(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    if (cmd) process.exitCode = 1;
}
