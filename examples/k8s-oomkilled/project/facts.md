# Facts ledger

| On screen | Source |
|---|---|
| 4 hops (browser → ingress → service → pod) | derived from incident.md "Healthy request" line and deployment.yaml (Ingress, Service, Deployment) |
| nginx | deployment.yaml: `kubernetes.io/ingress.class: nginx` |
| checkout:80 | deployment.yaml: Service port 80 |
| checkout-7d9f, checkout-7d9f-2xkqp, checkout-7d9f-9wzlt | incident.md, kubectl get pods output |
| PostgreSQL "orders" | incident.md "Healthy request" line |
| GET /checkout, 200 OK, 84 ms | incident.md "Healthy request" line; path also in deployment.yaml Ingress |
| 14:02, deploy v2.4.1 | incident.md first line; image tag in deployment.yaml |
| CrashLoopBackOff, 0/1, 6 restarts | incident.md |
| Last State: Terminated, Reason: OOMKilled | incident.md, kubectl describe output |
| 256Mi, v2.4.1 peaks at 410Mi | deployment.yaml limits.memory; incident.md memory profile |
| 512Mi, 2/2 running, 0 restarts | incident.md fix line |
| "OOMKilled is not a bug. It's a limit." | derived: the container exceeded limits.memory (256Mi < 410Mi peak) |
