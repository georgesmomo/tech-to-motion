# Example: why the pod dies

Input: [`source/deployment.yaml`](source/deployment.yaml) and [`source/incident.md`](source/incident.md) (fictional).
Output: [the 27.5 s video](../../assets/demo-k8s-oomkilled.mp4).

The prompt was:

```text
Make a 30-second explainer from deployment.yaml and incident.md: why the checkout pod died.
```

`project/` holds what the skill wrote: storyboard, facts ledger, scene files and logos.
To render it yourself:

```bash
node <skill>/scripts/ttm.mjs final examples/k8s-oomkilled/project
```

(`ttm` restores the generated files: index.html, the kit and GSAP copies, the sound track.)
