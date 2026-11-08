# Craft rules

30 fps reference (1 frame = 33 ms). UI motion specs are for apps; video needs about 1.5–2×
longer, because nothing is triggered by the viewer and everything must be parsed.

## Timing

| Action | Duration | Ease (GSAP) |
|---|---|---|
| Icon, dot, badge in | 0.25–0.4 s | `back.out(1.7)` or `expo.out` |
| Text line / card in | 0.4–0.6 s | `power3.out` |
| Panel, diagram group in | 0.6–0.8 s | `power3.out` |
| Exit | 60–75 % of the entrance | `power2.in` |
| Emphasis pulse | 0.3 s | `power2.out` yoyo |
| Camera pan / zoom | 0.8–1.5 s | `power3.inOut` / `expo.inOut` |
| Scene transition | 0.3–0.6 s | `expo.inOut` family |
| Edge draw | 0.4–0.6 s per 400 px | `power2.inOut` |
| Packet per edge | constant 400–700 px/s | `none` |
| Number counter | 0.8–1.5 s | `power2.out` |
| Typing | 18–35 chars/s with jitter, commands ≤ 1.5 s | stepped |

The kit uses these values by default. Override only with a reason.

- **Stagger:** list items 0.06–0.12 s, diagram nodes 0.15–0.4 s, words 0.04–0.08 s. Total
  stagger span ≤ 0.8 s.
- **Overlap:** start the next move at 60–75 % of the previous one. Never more than 3 moves
  strictly end-to-start: it looks robotic.
- **Rhythm:** vary it. A fast build, then a held read, then a snap. Constant easing and
  constant pace is the first thing that makes motion look generated.
- **Distances:** slide 20–60 px for text, scale cards from 0.9, icons from 0.4. Never fly text
  across the screen.
- **Anticipation and overshoot:** only on icons, badges and packets (`back.out`). Never on
  paragraphs, never on logos.

## Reading holds

- Hold any text ≥ 0.5 s + 0.3 s per word, minimum 1 s; numbers and code ≥ 2 s; code ≥ 1 s per
  line after typing ends. `ttm check` flags `line_unread` when a hold is too short.
- Final takeaway ≥ 2 s, end card ≥ 2 s.
- While the viewer reads, only one thing moves (the grid drift or one packet).
- New visual event every 1.5–3 s; never more than 4 s static (`dead_stretch` warning).

## Typography (bundled fonts, offline-safe)

| Look | Display | Body | Mono |
|---|---|---|---|
| blueprint | Inter 900 | Inter 500–700 | IBM Plex Mono |
| terminal | JetBrains Mono 800 | JetBrains Mono | JetBrains Mono |
| neon | Outfit 800 | Inter | Space Mono |
| paper | Playfair Display 700 | Inter | IBM Plex Mono |

In the terminal look everything is monospace: a hook line holds about 11 characters per
800 px on 9:16. Keep terminal hooks to 2–4 short words per line.

Minimum sizes (px at render size):

| Element | 16:9 (1920×1080) | 9:16 (1080×1920) | 4:5 / 1:1 (1080) |
|---|---|---|---|
| Hook | 96–160 | 110–160 | 100–140 |
| Title | 64–80 | 72–96 | 64–84 |
| Labels, node names | ≥ 34 | ≥ 44 | ≥ 40 |
| Code | ≥ 32, ≤ 14 lines | ≥ 36, ≤ 10 lines, ≤ 32 chars/line | ≥ 34 |
| Smallest anything | 28 | 32 | 30 |

The kit's type scale already switches with the ratio (`--fs-hook`, `--fs-title`, `--fs-label`,
`--fs-sub`, `--fs-code`...). Use those variables in your own styles instead of px.

## Safe areas

| Canvas | Keep text inside |
|---|---|
| 16:9 1920×1080 | 96 px left/right, 54 px top/bottom (title-safe); keep the bottom 15 % free of key info |
| 9:16 1080×1920 (universal Shorts/Reels/TikTok) | top 260, bottom 670, left 90, right 190 → a ~800×990 box |
| 4:5 1080×1350 | 60 px sides, 80 top, 160 bottom |
| 1:1 1080×1080 | 60 px all sides |

## Colour

- Only the look's variables: `--bg --panel --line --text --muted --accent --accent-2 --ok
  --err --packet`. 60/30/10: background, neutrals, accent. One primary accent per scene; the
  second accent only for "the thing that is different".
- Never meaning by red/green alone: pair with a word or icon (✓ / ✕, "OOMKilled").
- Failure grammar: colour in 2 frames (no slow fade), shake, glitch, error sound
  (`TTM.fail`). Edges after the failure dim to 30 % (`d.tint(..., { dim: true })`).
- Success grammar: colour, pulse, ding (`TTM.ok`); pipelines cascade green with 0.15 s stagger.
- Data flow: request in `--packet`, response in `--ok` or `--accent-2`. Max 3–5 dots per edge.

## Transitions

| Transition | When |
|---|---|
| Hard cut (`cut`) | between beats with the same subject |
| Whip (`whip`) | topic change, Fireship energy |
| Push (`push`) | next step of a sequence |
| Dive + zoom (`dive` → `enter "zoom"`) | from the map into one component |
| Match cut | same element in the same place in both scenes (a node becomes the next title) |
| Glitch | errors and "but…" twists, max 2 per video |

One family per video (whip or push) plus dive/zoom. A transition is ≤ 10 % of its beat.

## Light 3D

Use sparingly (≤ 20 % of the video): an isometric stack (`transform: rotateX(55deg)
rotateZ(-45deg)` on a wrapper with `perspective: 1600px`) for layers (infra / platform /
app), or a tilted establishing shot of the diagram that flattens to 0° before anything must be
read. Never text on a plane tilted more than 25°. Prefer CSS 3D to three.js: crisp text and
deterministic, and headless rendering without a GPU makes three.js slow.

## What makes motion look cheap (avoid all)

Uniform 1 s fades on everything; default easing everywhere; everything appearing at once;
bounce on every element; dead frames > 3 s or constant chaos; gradient blobs, glassmorphism,
sparkles, "AI brain" imagery; tiny text or paragraphs; text under platform UI; > 2 font
families; pure #000/#FFF; misaligned boxes; edges before nodes; packets that teleport;
transition salad; typing at constant speed with no caret; a sound on every event; a logo
intro instead of a hook; fake CLI output; abrupt ending.
