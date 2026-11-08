# The TTM kit

`TTM` is loaded globally in every scene (with GSAP and the look's CSS). Every helper adds tweens
to the scene's paused timeline at an **absolute scene time** and returns the time its motion
ends, so you chain beats with `t`:

```js
TTM.enter(tl, "#s2-stage", 0, "whip");          // the stage slides in...
let t = TTM.words(tl, "#s2-title", 0.05);         // ...already carrying content
t = d.build(tl, t);
```

Every helper also logs the sound its motion implies (see sound.md). Pass `{ sfx: false }` to
mute one, or `{ sfx: "pop" }` to change it.

## Scene skeleton (created by `ttm new` / `ttm sync`)

```html
<template>
  <div id="root" data-composition-id="s2" data-width="1920" data-height="1080">
    <div class="ttm-scene">
      <div class="ttm-grid" id="s2-grid"></div>          <!-- blueprint grid, drifts -->
      <div class="ttm-stage" id="s2-stage">              <!-- moved by enter/exit -->
        <div class="ttm-camera" id="s2-cam">             <!-- moved by zoom/dive/home -->
          ... your content, absolutely positioned in px ...
        </div>
      </div>
    </div>
  </div>
  <script>
    (function () {
      const D = 8;                       // kept equal to project.json by ttm
      const tl = gsap.timeline({ paused: true });
      TTM.drift(tl, "#s2-grid", 0, D);
      TTM.enter(tl, "#s2-stage", 0, "whip");
      let t = TTM.reveal(tl, "#s2-title", 0.05, { kind: "rise" });   // first reveal at 0-0.05 s
      // beats...
      TTM.exit(tl, "#s2-stage", D, "whip");
      window.__timelines["s2"] = tl;     // last line, key = scene id
    })();
  </script>
</template>
```

Position content with `style="position:absolute; left:…px; top:…px"`, or with `.ttm-center`
(text centred **inside the platform safe area**; set `top`) or `.ttm-safe` (a block spanning
the safe area's width). On 9:16 the safe box is off-centre (90 px left, 190 px right): use
these classes instead of centring on the full frame. Prefix every id with the scene id.

## Entrances and exits

| Call | Effect |
|---|---|
| `TTM.reveal(tl, target, at, { kind, dur, stagger, ease })` | First appearance. `kind`: `rise` (default), `drop`, `left`, `right`, `card`, `pop`, `slam`, `settle`, `blur`, `fade`, `line`. Call once per element. |
| `TTM.words(tl, target, at, { stagger: 0.07, kind })` | Splits a heading into words and reveals them. Child elements (e.g. `<span class="ttm-accent">`) count as one word. |
| `TTM.hide(tl, target, at, { dur, kind: "drop"\|"shrink", stagger })` | Exit of elements. |
| `TTM.type(tl, target, text, at, { cps: 26, seed, blinkUntil, maxDur: 1.6 })` | Types into an empty element with a caret, human rhythm. Long text types 70 % then completes. Returns end of typing. |
| `TTM.stream(tl, ".s3-out", at, { stagger: 0.11 })` | Terminal output: lines appear one after another. |
| `TTM.swap(tl, fromSel, toSel, at)` | Replaces a value in place. Markup: `<span class="ttm-swap"><span id="s4-a">256Mi</span><span id="s4-b">512Mi</span></span>`. |
| `TTM.count(tl, target, from, to, at, { dur: 1.2, decimals, prefix, suffix, sep })` | Animated number. |
| `TTM.highlight(tl, target, at, "--err", { alpha: 0.2 })` | Tints a code line or text background with a look colour. |

`kind` guide: `settle` for the hook at frame 0 (visible, slight scale-down), `slam` for a big
statement after the hook, `card` for panels, `pop` for icons/badges, `rise` for text,
`line` for terminal lines. Bounce (`pop`) never on paragraphs.

## Emphasis and state

| Call | Effect |
|---|---|
| `TTM.pulse(tl, target, at, { scale: 1.07 })` | Quick scale pulse. |
| `TTM.focus(tl, keep, all, at, { dim: 0.25 })` / `TTM.unfocus(tl, all, at)` | Dim everything on screen except the focus. Elements not revealed yet, or already hidden, are left alone. One focus at a time. |
| `TTM.fail(tl, target, at, { colorText, glitch })` | Error colour in 2 frames, shake, RGB glitch, error sound. Works on `.ttm-node` borders (via `--state`) and text (`colorText: true`). |
| `TTM.ok(tl, target, at)` | Success colour + pulse + ding. |
| `TTM.glitch(tl, target, at)` | RGB split jitter, 0.17 s. Max 2 per video. |
| `TTM.flash(tl, "#s3-flash", at)` | Full-frame flash; needs `<div class="ttm-flash" id="s3-flash"></div>` as the last child of `.ttm-scene`. Section breaks only. |
| `TTM.cue(t, "riser", { dur: 1.2 })` | Add a sound at a scene-local time (moves with the scene if durations change). |
| `TTM.drift(tl, target, at, dur)` | Slow ambient drift (grid). Every scene. |

## Transitions (on `#sN-stage`)

| Call | Use |
|---|---|
| `TTM.enter(tl, stage, 0, kind)` | `whip` (energy, topic change), `push` (next step), `zoom` (after a dive, or into detail), `rise`, `cut`. |
| `TTM.exit(tl, stage, D, kind)` | `whip`, `push`, `zoom`, `drop`, `cut`. Ends exactly at `D`. |
| `TTM.dive(tl, "#s2-cam", element, D)` | Zoom-through into a node until it fills the frame, ending at `D`. Next scene enters with `zoom`. The signature move from map to detail. |

Pick one transition family per video (whip **or** push), plus `dive`/`zoom` for drilling in.
Never cross-dissolve dense diagrams.

## Camera (on `#sN-cam`)

`TTM.zoom(tl, cam, element, at, { scale: 2, dur: 1.1, dx, dy })` centres an HTML element
(a node, a card; not an SVG shape) and scales; `TTM.home(tl, cam, at)` returns. Moves chain:
zoom → zoom → home works. Reveal internals only after the camera settles
(+0.1 s). Text must stay readable before and after.

## Diagrams

```js
const I = TTM_ICONS;                    // filled by: ttm icon googlechrome go postgresql redis --project <dir>
const d = TTM.diagram("#s2-map", {
  nodes: [
    { id: "user", label: "Browser", sub: "user", icon: I.googlechrome, x: 250, y: 560 },
    { id: "api",  label: "API", sub: "go · :8080", icon: I.go, x: 700, y: 560, w: 300 },
    { id: "db",   label: "PostgreSQL", sub: "orders", icon: I.postgresql, x: 1150, y: 560 },
    { id: "q",    label: "Redis", sub: "jobs", icon: I.redis, x: 700, y: 840, ghost: true },
  ],
  edges: [
    { from: "user", to: "api", label: "HTTPS" },
    { from: "api", to: "db", label: "SQL" },
    { from: "api", to: "q", dashed: true },
  ],
}, { prefix: "s2" });                   // container: <div id="s2-map" style="position:absolute; inset:0"></div>

t = d.build(tl, t, { step: 0.35 });     // nodes in order, each edge drawn when both ends exist
t = d.flow(tl, ["user", "api", "db"], t + 0.2);                      // request packets
t = d.flow(tl, ["db", "api", "user"], t + 0.1, { color: "--ok" });   // response
TTM.fail(tl, d.node("db"), t);          // node elements: d.node(id); paths: d.edge(a, b)
d.tint(tl, "api", "db", t, "--err", { dim: true });
```

- `x`, `y` are node **centres** in px. Box width grows to fit the text (estimated, mono-aware);
  default width 300, default height follows the ratio's type scale. Labels are plain text (no HTML). Keep labels short: 1–2 words, sub ≤ 16 chars.
- Layout per ratio: 16:9 left→right in one row (or two rows); 9:16 top→bottom in one column
  inside the safe box (x 90–890, y 260–1250), boxes ≤ 800 px wide; parallel steps on 9:16 go
  side by side as two short boxes (≤ 360 px each: short labels, sub ≤ 10 chars); 1:1 and 4:5 a 2×2 or 2×3 grid or a U-shape, ≤ 6 nodes. ≥ 120 px of free
  space between boxes on the axis an edge uses, no crossing edges, centres on multiples of 10.
- Edge labels: ≤ 3 per view (protocol or port where it matters); node labels do not count.
- Edges pick horizontal or vertical from the free space between boxes; force with
  `axis: "h"|"v"`. Node `align: "center"` centres text without an icon.
- `d.cascade(tl, ["commit", "test", "build", "deploy"], at, "--ok")` lights a chain of nodes and
  the edges between them one after another, ticks each and dings the last (pipelines going green).
- Node state: borders use `--state`. Idle nodes start in the look's idle colour (accent in
  blueprint/neon/paper, grey in terminal); `TTM.ok` / `TTM.fail` / `d.cascade` change it.
- Several edges into (or out of) the same side of a node are spread along that side, so
  converging arrows never share one arrowhead.
- `d.build(tl, at, { order: [...ids], step, edgeDur })`, `d.draw(tl, a, b, at)` for one edge,
  `d.flow(tl, ids, at, { color, speed: 650, size: 11, tail: 3, gap })`, `d.allNodes()`
  for `focus`.
- Single packet on any SVG path: `TTM.packet(tl, pathEl, at, { speed, color, reverse, hit })`.

## Markup patterns

Terminal:
```html
<div class="ttm-term" id="s3-term" style="left:140px; top:340px; width:1640px; height:520px">
  <div class="ttm-term-bar"><i></i><i></i><i></i><span>prod · zsh</span></div>
  <div class="ttm-term-body">
    <div class="ttm-line"><span class="ttm-prompt">$ </span><span id="s3-cmd"></span></div>
    <div class="ttm-line s3-out ttm-muted">NAME   READY   STATUS</div>
    <div class="ttm-line s3-out">api-7d9f   0/1   <span class="ttm-err">CrashLoopBackOff</span></div>
  </div>
</div>
```
`TTM.type(tl, "#s3-cmd", "kubectl get pods", t)` then `TTM.stream(tl, "#s3-term .s3-out", t)`.
Output lines must be real or faithfully shortened from the source. Columns aligned with spaces.

Code (tokens: `.k` keyword, `.s` string, `.n` number, `.c` comment, `.f` function, `.t` key/type):
```html
<div class="ttm-code" id="s4-code" style="left:140px; top:360px; width:900px"><span class="t">resources</span>:
  <span class="t">limits</span>:
<span class="ttm-hl" id="s4-line">    <span class="t">memory</span>: <span class="n">256Mi</span></span></div>
```
`white-space: pre` is on: indentation is literal, keep the first line on the opening tag.
`.ttm-hl` is a block: do not put a newline right after its closing tag (it would add an empty
line). ≤ 14 lines on 16:9, ≤ 10 on 9:16. Highlight: `TTM.highlight(tl, "#s4-line", t, "--accent")`.

Text (sizes follow the ratio's type scale, e.g. hook 132/116/100 px for 16:9 / 9:16 / square):
`.ttm-hook`, `.ttm-title`, `.ttm-kicker` (mono caps label), `.ttm-body`,
`.ttm-muted`, `.ttm-accent`, `.ttm-accent-2`, `.ttm-ok`, `.ttm-err`, `.ttm-mark` (highlighter).
Blocks: `.ttm-card`, `.ttm-badge` (add `.ttm-ok`/`.ttm-err` for colour), `.ttm-stat` (big number),
`.ttm-end-url`.

## HyperFrames rules the kit cannot enforce

- Root of each scene file is `<template>`; styles and scripts outside it are dropped.
- Never animate `display`/`visibility` on timed elements; never put a CSS `transform` in a
  style attribute on an element you animate (set start states in the kit call instead).
- `<span>` that moves needs `display:inline-block` (`.ttm-word` and `.ttm-swap` do this).
- Images: `assets/...` relative paths, files inside the project.
- Fonts: the looks use Inter, IBM Plex Mono, JetBrains Mono, Outfit, Space Mono and
  Playfair Display, which HyperFrames embeds at render time. `ttm` inlines the kit CSS into
  index.html so the compiler sees them. Another family needs a local `@font-face`.
- `settle` starts at scale 1.08: keep hook text 8 % inside the safe area.
- Editing `index.html` is pointless: `ttm` regenerates it from project.json.
