# Formats, structures and hooks

## Universal skeleton

`HOOK → STAKES → MECHANISM (1–4 beats) → TWIST → PAYOFF → END CARD`

Half of the viewers who leave a short video leave in the first 3 seconds. So the hook is on
screen at frame 0 (no logo intro, no fade from black), and the payoff answers the hook.

## Time budgets (seconds)

| Beat | 15 s | 20 s | 30 s | 45 s | 60 s | 90 s |
|---|---|---|---|---|---|---|
| Hook | 0–2 | 0–2.5 | 0–3 | 0–3 | 0–3 | 0–4 |
| Stakes / context | 2–4 | 2.5–5 | 3–7 | 3–8 | 3–10 | 4–14 |
| Mechanism | 4–11 (1 beat) | 5–15 (1–2 beats) | 7–22 (2 beats) | 8–34 (2–3 beats) | 10–45 (3 beats) | 14–70 (4 beats) |
| Twist / gotcha | — | — | — | 34–39 | 45–52 | 70–80 |
| Payoff | 11–13.5 | 15–18 | 22–27 | 39–42.5 | 52–57 | 80–86 |
| End card | 13.5–15 | 18–20 | 27–30 | 42.5–45 | 57–60 | 86–90 |

Other lengths: interpolate between the nearest columns.

Scenes map to beats: usually 4–6 scenes for 30 s, 6–9 for 60 s. A scene under 2.5 s is a
cut, not a scene; a scene over 12 s needs a camera move or a focus change inside it.

## Per format

| Format | Source it comes from | Structure |
|---|---|---|
| **Architecture** (signature) | compose, k8s, Terraform, diagram, repo | Question hook → build the map node by node in data-flow order → packet run on the happy path → `dive` into one component → its internals or the failure/scale twist → whole map lit → one-line takeaway |
| **Pipeline** | `.github/workflows`, `.gitlab-ci.yml`, Jenkinsfile | Commit appears → stages light up in order → one stage fails red (the real failure mode) → fix → all green → deploy targets |
| **Incident** | postmortem, alert, logs | Timestamp + alert ("03:12 · PagerDuty") → symptom graph or error → investigation (2 real commands) → root cause reveal → fix → lesson in one line |
| **Release** | CHANGELOG, release notes, PR list | Version slam → 3–5 feature cards, 3–5 s each, each with a micro-demo → upgrade command |
| **Concept** ("X in 60 s") | a topic, docs | Cold-open claim → one-line origin (≤ 5 s) → what it is (kinetic type) → minimal code typed → 2–3 rapid facts → gotcha → "that's X in 60 seconds" |
| **Terminal demo** | a CLI, README usage | Command typed → output streams → key line highlighted → before/after numbers → install command |
| **Repo trailer** | a repo README | Pain hook → name + one-liner → 3 features as micro-demos → install line / URL |

## Hook patterns for engineers

| Pattern | Example |
|---|---|
| Counter-intuitive claim | "Your index is making writes slower." |
| Concrete number (from the source) | "4 hops. One of them kills your request." |
| Failure in progress | Red terminal `OOMKilled` → "Why did this pod die?" |
| Question + visual | "What happens when you type `git push`?" with the command typing |
| Before / after | "12 min build → 90 s", numbers on screen at frame 0 |
| "Stop doing X" | "Stop putting secrets in env vars." |
| Myth-bust | "Kubernetes doesn't restart your container. The kubelet does." |

Hook rules: ≤ 8 words, readable at frame 0, motion already happening at frame 0
(`settle`), the number or claim must be in facts.md.

## Picking the one idea

Ask: what is the one thing a viewer should repeat to a colleague after watching? Good:
"the worker retries forever, so one Redis blip becomes a backlog". Bad: "here are our 7
services". If the source has a real failure mode, a bottleneck or a clever trick, that is the
idea; the architecture is the setting, not the story.

## Durations by platform

| Where | Ratio | Length that performs | Notes |
|---|---|---|---|
| LinkedIn feed | 1:1 or 4:5 (16:9 OK) | 15–30 s | ~80 % watch muted: every idea must be readable on screen |
| X | 16:9 or 1:1 | 15–45 s | muted autoplay too |
| YouTube Shorts / Reels / TikTok | 9:16 | 20–45 s | universal safe area, loop the last frame to the first if possible |
| README / docs hero | 16:9 | 10–30 s | also export a GIF if asked |
| Talk / onboarding | 16:9 | 45–90 s | slower holds are fine |
