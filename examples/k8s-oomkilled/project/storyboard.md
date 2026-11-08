# Storyboard: "Why the pod dies" · 27.5 s · 16:9 · blueprint

Idea: OOMKilled is not a bug, it's a limit. Source: ../source/deployment.yaml and ../source/incident.md.

| Scene | Time | On screen (exact text) | Motion | Sound |
|---|---|---|---|---|
| s1 | 0–3 | "Your request takes 4 hops." / "One of them can kill it." | hook settles at frame 0, sub rises | impact, whoosh out |
| s2 | 3–11 | GET /checkout · Browser → Ingress (nginx) → Service (checkout:80) → Pod → PostgreSQL (orders) · "200 OK · 84 ms" | node-by-node build, request packets, green response, dive into the pod | pops, ticks, ding, whoosh |
| s3 | 11–18 | "14:02 · deploy v2.4.1" · "Then the pod dies." · kubectl get pods → CrashLoopBackOff ×2 · kubectl describe → OOMKilled | zoom in, typing, streamed output, glitch, failure | typing, clicks, glitch, error |
| s4 | 18–24 | "Give it the memory it uses." · limits.memory 256Mi → 512Mi · "pods running 2/2" | code card, red highlight, value swap, green, stat | pop, tick, ding |
| s5 | 24–27.5 | "OOMKilled is not a bug. It's a limit." · "Made with tech-to-motion" | words, end card holds | whoosh in |
