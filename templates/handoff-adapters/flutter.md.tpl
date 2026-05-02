# Flutter Adapter — <prototype-slug>

> Source HTML sketches: .supervibe/artifacts/prototypes/<slug>/{ios,android}/
> Target stack: Flutter 3.19+

## Component mapping
| Prototype HTML | Flutter widget | Note |
|---|---|---|
| `<div>` (layout) | `Container`, `Row`, `Column`, `Flex` | composition-heavy by design |
| text | `Text` | always wrap text in `Text` widget |
| `<img>` | `Image.network` / `Image.asset` | must specify size or wrap in `SizedBox` |
| `<button>` | `ElevatedButton` / `TextButton` / `IconButton` | Material 3 by default |
| `<input>` | `TextField` | controlled by `TextEditingController` |
| `<a>` | `GestureDetector` + `url_launcher` | no built-in link widget |
| CSS Grid | `GridView.builder` | scroll built-in |
| flex | `Row` / `Column` + `Expanded` / `Flexible` | weight via `flex:` |
| `position: fixed` | `Stack` + `Positioned` | overlay layout |

## Token bridging
- Generate `lib/theme/tokens.dart` from `tokens.css`. Group by category: colors, spacing, radii, typography.
- Typography → `TextTheme` in `MaterialApp.theme`
- Colors → `ColorScheme.fromSeed` + custom extensions

## Motion
- `AnimationController` + `Tween` + `CurvedAnimation`
- Match CSS easing names to Flutter `Curves`: `ease-in-out` → `Curves.easeInOut`, `cubic-bezier(0.4, 0, 0.2, 1)` → `Curves.easeInOutCubic`
- `MediaQuery.of(context).disableAnimations` for reduced-motion

## Platform divergence
- Material 3 is default; for iOS-faithful UI use `Cupertino*` widgets or `flutter_platform_widgets`.
- Document divergence policy in `notes.md`.

## Anti-patterns
- mixing Material + Cupertino without an adapter
- ignoring `MediaQuery.padding` (safe-area)
- `setState` in deep widget trees (use `Provider` / `Riverpod`)
