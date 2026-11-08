# Incident notes, checkout (fictional example)

- 14:02 deploy v2.4.1 (new PDF invoice library).
- 14:05 checkout pods in CrashLoopBackOff, 6 restarts each.
  `kubectl get pods` → checkout-7d9f-2xkqp 0/1 CrashLoopBackOff 6, checkout-7d9f-9wzlt 0/1 CrashLoopBackOff 6
- `kubectl describe pod checkout-7d9f-2xkqp` → Last State: Terminated, Reason: OOMKilled
- Memory profile: v2.4.1 peaks at 410Mi, limit is 256Mi.
- Fix: limits.memory 256Mi → 512Mi. 2/2 pods running, 0 restarts since rollout.
- Healthy request: GET /checkout → 200 OK in 84 ms (browser → nginx ingress → service → pod → PostgreSQL "orders").
