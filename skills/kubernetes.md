# Kubernetes Skill

Loaded when the project uses Kubernetes for container orchestration.
Supplements `rules/conventions.md` and `skills/docker.md` with K8s-specific
patterns.

---

## Project Setup

- **Local dev**: `minikube start`, `kind create cluster`, or `k3d`
- **CLI**: `kubectl` (aliased to `k` recommended: `alias k=kubectl`)
- **Package manager**: `helm`
- **Debug**: `kubectl logs`, `kubectl describe`, `kubectl exec -it`
- **Port forward**: `kubectl port-forward svc/my-service 8080:80`
- **Lint**: `kubeconform`, `kubectl --dry-run=client`, `polaris`
- **Secret management**: `sops`, `helm-secrets`, `external-secrets-operator`


## Conventions

### Naming

- **Namespaces**: `kebab-case` — `my-app`, `production`, `staging`
- **Resources**: Consistent prefix matching the app — `my-app-deployment`,
  `my-app-service`, `my-app-config`
- **Labels**: Use [recommended labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/):
  ```yaml
  app.kubernetes.io/name: my-app
  app.kubernetes.io/instance: my-app
  app.kubernetes.io/version: 1.0.0
  app.kubernetes.io/component: backend
  app.kubernetes.io/part-of: my-project
  app.kubernetes.io/managed-by: helm
  ```
- **Selectors**: Match labels. Avoid `matchLabels` without `matchExpressions`
  when possible.

### Resource Layout

```
k8s/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   └── hpa.yaml
├── overlays/
│   ├── dev/
│   │   └── kustomization.yaml
│   ├── staging/
│   │   └── kustomization.yaml
│   └── prod/
│       └── kustomization.yaml
└── helm/
    └── my-app/
        ├── Chart.yaml
        ├── values.yaml
        ├── values/
        │   ├── dev.yaml
        │   ├── staging.yaml
        │   └── prod.yaml
        └── templates/
            ├── _helpers.tpl
            ├── deployment.yaml
            ├── service.yaml
            └── ingress.yaml
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: my-app
spec:
  replicas: 3
  revisionHistoryLimit: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0       # zero-downtime deploys
      maxSurge: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: my-app
  template:
    metadata:
      labels:
        app.kubernetes.io/name: my-app
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: app
          image: my-registry/my-app:1.0.0
          ports:
            - containerPort: 8080
              protocol: TCP
          envFrom:
            - configMapRef:
                name: my-app-config
            - secretRef:
                name: my-app-secrets
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 3
            periodSeconds: 5
          startupProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 0
            failureThreshold: 30
```

### Resource Guidelines

- **Always set resource requests and limits**. Without them, a noisy
  neighbour can starve your pod. Request = guaranteed, limit = ceiling.
- **Always define probes**:
  - `livenessProbe` — restart if deadlocked or hung.
  - `readinessProbe` — remove from Service endpoints if not ready.
  - `startupProbe` — delay liveness checks for slow-starting containers
    (JVM, ML models).
- **Pod anti-affinity** for production workloads to spread across nodes:
  ```yaml
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: my-app
            topologyKey: kubernetes.io/hostname
  ```
- **`terminationGracePeriodSeconds`** — set to allow graceful shutdown
  (handle SIGTERM, drain connections, flush buffers). 30s minimum.
- **Security context** — run as non-root:
  ```yaml
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  ```

### Service & Ingress

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
  selector:
    app.kubernetes.io/name: my-app
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "10r/s"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [my-app.example.com]
      secretName: my-app-tls
  rules:
    - host: my-app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app
                port:
                  number: 80
```

### Config & Secrets

- **ConfigMap** for non-sensitive config (env vars, config files).
- **Secrets** for sensitive data. Never commit raw secrets — use
  `kubectl create secret generic` or `sops` + `helm-secrets`.
- **External Secrets Operator** or **Vault CSI Provider** for production
  secret management.

### Helm Conventions

```yaml
# Chart.yaml
apiVersion: v2
name: my-app
description: My application
type: application
version: 0.1.0
appVersion: "1.0.0"
```

- **`values.yaml`** contains defaults with comments. Environment overrides
  in `values/<env>.yaml`.
- **`_helpers.tpl`** for reusable template logic (labels, names, selectors).
- **`helm lint`** and **`helm template --debug`** in CI.
- **Semver chart versions**. Always increment `version` when templates change.

### Pod Priority & Resource Quotas

```yaml
# PriorityClass for critical workloads
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 1000
globalDefault: false
description: "Critical production pods"
```

- Use priority classes to differentiate critical vs best-effort pods.
- Set `ResourceQuota` per namespace to prevent one team from consuming
  all cluster resources.

### Tooling in CI

```yaml
# GitHub Actions — k8s validation
- name: Validate manifests
  run: |
    kubectl kustomize k8s/overlays/dev | kubeconform -summary
```

- **`kubeconform`**: Validate manifests against the K8s schema.
- **`polaris`**: Best-practice audit (security, reliability).
- **`kubescape`**: Security scanning (NSA/CISA hardening guide).
- **`kyverno` / `OPA Gatekeeper`**: Policy enforcement in-cluster.

### Cross-References

- Load `skills/docker.md` for container image conventions.
- Load `skills/yaml.md` for YAML formatting rules.
- Load `skills/github-actions.md` for CI deployment pipelines.
- Load `skills/terraform.md` if provisioning K8s clusters via IaC.
