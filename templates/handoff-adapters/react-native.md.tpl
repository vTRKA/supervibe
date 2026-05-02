# React Native Adapter — <prototype-slug>

> Source HTML sketches: .supervibe/artifacts/prototypes/<slug>/{ios,android}/
> Target stack: React Native (>= 0.74) or Expo SDK 50+

## Component mapping
| Prototype HTML | RN equivalent | Note |
|---|---|---|
| `<div>` (layout) | `<View>` | flexbox by default, no margin-collapse |
| `<p>`, `<span>`, `<h1>`–`<h6>` | `<Text>` | text MUST be inside `<Text>`, not in `<View>` |
| `<img>` | `<Image source={{ uri: ... }} />` | requires explicit width+height |
| `<button>` | `<Pressable>` (preferred) or `<TouchableOpacity>` | `Pressable` for Android ripple compat |
| `<input>` | `<TextInput>` | controlled; iOS+Android keyboard differ |
| `<a>` | `<Pressable onPress={() => Linking.openURL(...)}>` | no built-in router-link |
| CSS Grid | `react-native-grid-list` or manual | RN has no native grid |
| `position: fixed` | `<Modal>` or top-level `<View>` | no fixed positioning |

## Token bridging
- `tokens.css` CSS vars → JS `tokens.ts` constants (manual export). Use a tiny generator if many tokens.
- Typography: map `--type-family-body` to `Platform.select({ ios: 'SF Pro Text', android: 'Roboto' })` if explicit; else system default.
- Spacing scale: keep numeric (RN uses `dp` not `rem`). 1rem ≈ 16dp.

## Motion mapping
- CSS `transition` → `react-native-reanimated` `withTiming`
- CSS keyframes → `react-native-reanimated` `withRepeat` + interpolations
- Prefers-reduced-motion: read `AccessibilityInfo.isReduceMotionEnabled()`

## Platform divergence policy
- Document per-screen iOS vs Android differences in `notes.md`.
- Use `Platform.OS` switches sparingly; prefer platform-specific files (`Component.ios.tsx` / `Component.android.tsx`) when divergence > 30%.

## Safe-area
- Wrap top-level screens in `<SafeAreaView>` from `react-native-safe-area-context`.
- Test on devices with notch (iPhone 14+, Pixel 7+).

## Anti-patterns
- using `display: grid` styles in RN (will silently no-op)
- assuming `box-sizing: border-box` (RN is always content-box)
- 100vh / 100vw (use `Dimensions.get('window')` or flex)
