# Quality loop

Agents cannot watch a video, but they can look at frames. This loop is what separates a
studio result from a generated one. Run it before every final render, up to 3 rounds.

## 1. `ttm check <dir>`

Runs HyperFrames lint plus runtime, layout, contrast and craft checks, then its own
**safe-area check** (every visible text measured at several moments of each scene against the
platform safe zone), and prints only what matters (findings caused by the kit's own layers on purpose are hidden; the full JSON is in
`.ttm-check.json`).

| Finding | Usual fix |
|---|---|
| `[safe-area] … outside the safe area (bottom 120px)` | move or shrink it into the safe box; on 9:16 use `.ttm-center` / `.ttm-safe` |
| `text_occluded`, `content_overlap` | move one element; give text its own zone |
| `text_below_floor` | raise to ≥ 28 px (16:9) |
| `line_unread` | hold longer: 0.5 s + 0.3 s per word, or cut words |
| `dead_stretch` (> 3 s no change) | add a beat, a packet, a focus change, or shorten the scene |
| `first_frame_empty` | hook with `{ kind: "settle" }` at 0 in s1 |
| contrast errors | use `--text` / `--accent` on `--bg`, never `--muted` on `--panel` for key text |
| `missing_timeline_registry` | `window.__timelines["sN"] = tl;` with the exact scene id |
| `non_deterministic_code` | remove `Math.random`/`Date.now`; use `TTM.rng(seed)` |
| `font_family_without_font_face` | use a look font or add a local `@font-face` |
| `film_silent` before `ttm sfx` | normal: sound is added at draft/final |

Zero errors is required. Warnings: fix, or state in one line why it is intended.

## 2. `ttm stills <dir> [--at 1.2,4.5,9]`

Always: frame 0 and one still per scene at 65 % of its length. Add `--at` for the key
moments (added to the defaults; `--only` to get just those): hook frame 0, each reveal of the one idea, the failure, the
payoff. Start with `contact-sheet*.jpg` (all frames at a glance), then open single frames
for detail. A dashed magenta box shows the platform safe area (on stills only, never in the
render). Check:

1. **Hook:** readable at frame 0, ≤ 8 words, the biggest thing on screen.
2. **One focus per frame:** the eye knows where to go in under a second.
3. **Legibility:** nothing under the size floor, nothing clipped, no text overflowing a box,
   no overlap, nothing in the platform UI zones (9:16).
4. **Alignment:** boxes on a grid, equal gaps, edges not crossing, arrows in the flow
   direction.
5. **Facts:** every word, number, port, command and output on screen appears in facts.md.
   Secrets masked.
6. **Hierarchy:** one title, ≤ 3 labels per diagram view, ≤ 12 words on screen (8 on 9:16).
7. **Look:** only look colours; accent used sparingly; no pure black/white.
8. **Ending:** takeaway held, end card clean.

## 3. Draft check (when you rendered a draft)

`ttm draft` prints duration, streams, audio peak, black segments. If a transition looked wrong,
extract frames from the MP4: `ttm frames <dir>/renders/draft.mp4 --at 10.6,10.8` (also writes
`frames/sheet.png`, all frames tiled) and open them. Compare one or two with the stills: they
must match (same fonts, same layout).

## Stop conditions

- 3 rounds done and only taste-level issues remain: render and mention them.
- A problem you cannot fix (missing font, broken Chrome): stop and tell the user exactly what
  to run.
- Never report "done" while `verify` shows ✗.
