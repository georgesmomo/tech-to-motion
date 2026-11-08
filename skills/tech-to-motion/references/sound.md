# Sound design

Sound is half of what makes motion feel professional. tech-to-motion does it automatically and
without any audio file or licence: every sound is synthesised from a seed.

## How it works

1. While you build, kit helpers log the sound their motion implies, at the exact time:

| Helper | Sound |
|---|---|
| `reveal` `settle` / `slam` | impact |
| `reveal` `pop` / `card`, diagram nodes | pop (cards quieter) |
| `type` | typing burst for the typing duration |
| `stream` | click per line |
| packet arrival (`d.flow`, `packet` with `hit`) | tick |
| `swap` | tick |
| `fail` | error + glitch |
| `ok` | ding |
| `glitch` | glitch |
| `enter` / `exit` / `dive` / `zoom` | whoosh |

2. `ttm sfx` (also run by `draft` and `final`) loads each scene in headless Chrome, collects
   the cues, adds your manual `cues.json`, thins the crowd (no two whooshes within 0.5 s, no
   small sounds within 0.14 s of another, priority to impacts, errors and dings), and writes
   `assets/audio/sfx.wav` plus `cues.auto.json` (what was kept).
3. `ttm final` normalises loudness in two passes (measure, then apply linearly): −16 LUFS for
   effects only, −14 LUFS with music, true peak ≤ −1.5 / −1 dBTP (YouTube, LinkedIn, TikTok and Instagram all normalise around −14).

## Manual cues (`cues.json`)

Add what the helpers cannot know, with absolute video times:

```json
[
  { "t": 9.6, "sfx": "riser", "dur": 1.4 },
  { "t": 21.0, "sfx": "swell", "dur": 0.8, "gain": -3 },
  { "t": 0.0, "sfx": "impact", "gain": 2 }
]
```

Types: `whoosh`, `pop`, `click`, `tick`, `typing` (`dur`, `cps`), `riser` (`dur`, put `t`
so it **ends** on the reveal), `swell`, `impact`, `glitch`, `ding`, `error`. `gain` in dB.
To silence a helper, pass `{ sfx: false }` in the call (works on every helper, including
`words` and `d.build`). Prefer `TTM.cue(t, type, extra)` inside a scene (scene-local time,
moves with the scene) over absolute times in cues.json.

`project.json` → `"sound": "auto"` (default), `"manual"` (only cues.json), `"none"`.

## Rules

- Max about one sound per 0.5 s on average. Do not sound every item of a stagger.
- Silence 0.2–0.4 s before the payoff makes it land.
- A riser before the reveal of the one idea, at most once.
- Sounds may lead the picture by one frame, never lag by more than three.

## Music

No music by default: it suits muted-first platforms and avoids licence trouble. If the user
gives a file: `ttm final <dir> --music path.mp3` (or `"music": "assets/audio/bed.mp3"` in
project.json). It is trimmed, faded in 1 s and out 2 s, mixed about 13 dB under, and the
whole mix is normalised.

Safe sources to suggest: Incompetech (CC BY 4.0, credit line required), Free Music Archive
tracks without NC/ND. Pixabay and Mixkit are fine inside a rendered video but their files must
never be committed to a public repo. Avoid the YouTube Audio Library outside YouTube.
