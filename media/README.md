# Brand assets

Canonical OpenAtlas logo files used across the product:

| File | Use |
|------|-----|
| `logo.png` | Web top bar, PWA/apple-touch, Android icon source |
| `logo.ico` | Browser tab favicon (optional; build generates a multi-size `.ico` into `web/public/`) |

After editing these files, run:

```bash
./scripts/sync-brand-assets.sh
```

Or any of: `bun run build` (in `web/`), `./dev.sh run-android`, `./scripts/generate-android-icons.sh`.
