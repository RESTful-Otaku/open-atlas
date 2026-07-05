# React Native Skill

Loaded when the project uses React Native. Supplements `rules/conventions.md`
and `react.md` with RN-specific patterns.

**Also load**: `react.md` (core React patterns), `typescript.md`,
`capacitor.md` (for comparison with hybrid approach).

---

## Project Setup

- **Init**: `npx react-native@latest init <name>` (CLI) or
  `npx create-expo-app <name>` (Expo, recommended for new projects)
- **Run**: `npx react-native run-ios` / `npx react-native run-android`
- **Expo**: `npx expo start` then scan QR with Expo Go
- **Lint**: `eslint .`
- **Type check**: `tsc --noEmit`
- **Test**: `jest` (comes with RN)

## Project Structure

```
src/
├── app/                 # navigation, app entry
├── screens/             # full-screen views
├── components/          # shared UI components
├── hooks/               # custom hooks
├── services/            # API clients, native modules
├── lib/                 # utilities, config
├── types/               # shared types
└── theme/               # colours, typography, spacing
```

## Code Patterns

### Component — Native

```typescript
import { View, Text, StyleSheet, Pressable } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ title, onPress, variant = 'primary' }: ButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 12, borderRadius: 8, alignItems: 'center' },
  primary: { backgroundColor: '#007AFF' },
  secondary: { backgroundColor: '#E5E5EA' },
  pressed: { opacity: 0.7 },
  text: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
```

### Navigation (React Navigation)

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '~/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

## Conventions

- **Expo over bare CLI** for new projects. Expo SDK now supports most native
  APIs. Eject only when a required native module isn't available in Expo.
- **TypeScript**: `.tsx` always. Navigation param lists typed with
  `RootStackParamList`.
- **StyleSheet.create()** over inline style objects. Never use `StyleSheet.flatten`
  in hot paths.
- **No `Dimensions.get('window')` directly**: Use `useWindowDimensions()` hook
  — it updates on resize (split screen, rotation).
- **Platform-specific code**: Use `.ios.tsx` / `.android.tsx` file extensions
  rather than `Platform.OS` branching. The bundler picks the right file.
- **Image assets**: Use the correct density (`@2x`, `@3x`). Prefer vector
  formats (SVG via `react-native-svg`) over raster when possible.
- **Performance**:
  - Use `FlatList` over `ScrollView` for lists > 20 items.
  - Key props on list items. `React.memo` for pure components.
  - Avoid anonymous functions in render (use `useCallback`).
  - Profile with React DevTools Profiler before optimising.
- **State management**: Same as React — local state, Context, Zustand/Jotai
  for shared state. TanStack Query for server state.
- **Testing**: React Native Testing Library. Test on both platforms.
  Use `@testing-library/react-native`.
- **No web-first components**: A React component is not automatically a
  React Native component. `div` → `View`, `span` → `Text`, `button` →
  `Pressable`/`TouchableOpacity`.
- **Accessibility**: `accessibilityLabel`, `accessibilityRole`, and
  `accessibilityState` on all interactive elements.
