# Capacitor Skill

Loaded when the project uses Capacitor for cross-platform mobile apps.
Supplements `rules/conventions.md` with Capacitor-specific patterns.

**Also load**: `typescript.md` (if using TypeScript), `svelte.md` (if the
web layer uses Svelte).

---

## Project Setup

- **Init**: `npm create @capacitor/app` or add to existing web project
- **Add platform**: `npx cap add android` / `npx cap add ios`
- **Sync**: `npx cap sync`
- **Run**: `npx cap run android` / `npx cap run ios`
- **Open IDE**: `npx cap open android` / `npx cap open ios`
- **Build + sync**: `npm run build && npx cap sync`

## Project Structure

```
project/
├── src/                  # web app source
├── android/              # Android platform (generated)
├── ios/                  # iOS platform (generated)
├── capacitor.config.ts   # Capacitor configuration
└── package.json
```

## Capacitor Configuration

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'MyApp',
  webDir: 'build',             // or 'dist'
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
```

## Common Plugins

| Plugin | Use |
|--------|-----|
| `@capacitor/status-bar` | Status bar appearance |
| `@capacitor/splash-screen` | Splash screen |
| `@capacitor/storage` | Key-value storage |
| `@capacitor/filesystem` | File system access |
| `@capacitor/preferences` | Preferences (replaces storage) |
| `@capacitor/geolocation` | GPS |
| `@capacitor/camera` | Camera / photo picker |
| `@capacitor/push-notifications` | Push notifications |
| `@capacitor/network` | Network status |
| `@capacitor/share` | Native share sheet |
| `@capacitor/haptics` | Haptic feedback |

## Code Patterns

### Bridge Access

```typescript
import { Preferences } from '@capacitor/preferences';

export async function saveToken(token: string): Promise<void> {
  await Preferences.set({ key: 'auth_token', value: token });
}

export async function getToken(): Promise<string | null> {
  const { value } = await Preferences.get({ key: 'auth_token' });
  return value;
}
```

### Platform Detection

```typescript
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  // Native-only code
} else {
  // Web fallback
}

const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
```

### Custom Plugin (TypeScript)

```typescript
// src/lib/plugins/file-picker.ts
import { registerPlugin } from '@capacitor/core';

export interface FilePickerPlugin {
  pick(): Promise<{ path: string; name: string }>;
}

export const FilePicker = registerPlugin<FilePickerPlugin>('FilePicker');
```

## Conventions

- **Web first**: Build and test in the browser first. Capacitor wraps the web
  app — if it doesn't work in the browser, it won't work natively.
- **Plugin abstractions**: Wrap Capacitor plugin calls in service modules.
  Don't call `@capacitor/*` directly from components.
- **Fallbacks**: If a plugin is unavailable on web, provide a graceful fallback
  (e.g., mock data, browser-native API).
- **Permissions**: Request permissions at the point of use, not at app start.
  Use the plugin's `requestPermissions()` method.
- **Native code**: Minimize custom native code. Prefer Capacitor plugins.
  If you must write native code, keep it in platform-specific directories.
- **Testing**: Mock Capacitor plugins in unit tests. Use `@capacitor/core`
  mocking utilities.

## Debugging

- **Web**: Chrome DevTools (localhost)
- **Android**: Chrome `chrome://inspect` (USB debugging enabled)
- **iOS**: Safari Web Inspector (connect device, open dev tools)
- **Logs**: `console.log` works on all platforms. Use `Capacitor.toast()`
  for user-facing messages on native.
