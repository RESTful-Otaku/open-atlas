# Docker & Containers Skill

Loaded when the project uses Docker for containerisation. Supplements
`rules/conventions.md` with container-specific patterns.

---

## Project Setup

- **Image build**: `docker build -t <name>:<tag> .`
- **Run**: `docker run -p 3000:3000 <name>:<tag>`
- **Compose**: `docker compose up -d`
- **Stop**: `docker compose down`
- **Prune**: `docker system prune -a` (clean up unused images)
- **Scan**: `docker scout quick <image>` (vulnerability scan)

## Dockerfile Patterns

### Multi-Stage Build (TypeScript/Node example)

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci --omit=dev
COPY . .
RUN npm run build

# Stage 2: Run
FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
```

### Distroless / Minimal (Rust example)

```dockerfile
# Stage 1: Build
FROM rust:1.85-alpine AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock .
COPY src ./src
RUN cargo build --release

# Stage 2: Run — distroless for minimal attack surface
FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/target/release/myapp /myapp
EXPOSE 8080
CMD ["/myapp"]
```

## Docker Compose (development)

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    volumes: [".:/app", "/app/node_modules"]
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/app
    depends_on: [db]

  db:
    image: postgres:17-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: app

volumes: { pgdata: }
```

## Conventions

- **`.dockerignore`** is mandatory. Include at minimum:
  ```
  node_modules/
  .git/
  dist/
  *.md
  .env
  ```
- **Multi-stage builds** for all compiled languages. Separate build
  dependencies from runtime dependencies.
- **Distroless base images** for production. Alpine is a reasonable
  compromise. Avoid `ubuntu` or `debian`-slim for production unless you
  need system libraries.
- **Don't run as root**: Add `USER <non-root>` user in the final stage.
  Create one if the base image doesn't provide it:
  ```dockerfile
  RUN addgroup -S app && adduser -S app -G app
  USER app
  ```
- **One process per container**. If you need multiple processes, use
  docker compose with separate services, not a process manager inside
  one container.
- **Health check**: Define `HEALTHCHECK` for production containers:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
  ```
- **Immutable tags in production**: Use `git-sha` or semantic version
  tags, not `:latest`. `:latest` makes rollbacks impossible.
- **Layer caching**: Order `COPY` and `RUN` instructions from least to
  most frequently changing. Install dependencies before copying source.
  Combine `RUN` commands to reduce layers.
- **No secrets in images**: Use `--secret` mount for build-time secrets.
  Use docker secrets or env files (`.env` in gitignore) for runtime.
- **Resource limits**: In production, set `--memory` and `--cpus` on
  containers or in compose:
  ```yaml
  services:
    app:
      deploy:
        resources:
          limits:
            memory: 512M
            cpus: '0.5'
  ```
- **Logging**: Write to stdout/stderr. Never configure log rotation inside
  the container — the container runtime (docker, k8s) handles it.
- **Vulnerability scanning**: Run `docker scout quick <image>` in CI.
  Block builds with critical vulnerabilities.
