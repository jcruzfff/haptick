# haptick

**Real haptic feedback for the mobile web, including iPhone.**

<a href="https://jcruzfff.github.io/haptick/"><img src=".github/assets/demo.webp" alt="The haptick demo: buttons, a slider, a drag pad, a carousel, a scrolling chip row and a slide-to-confirm control" width="100%"></a>

Haptics for taps and drags in iOS Safari and on Android, with no
dependencies.

## Install

```sh
npm install haptick
```

## How it works

### iPhone

iOS 17.4 added a native switch control, `<input type="checkbox" switch>`, and
WebKit plays the system haptic every time a finger flips one.

- **Taps.** haptick lays an invisible switch over the element. A real tap
  flips it, which ticks, and the click carries on to your element. A
  **tap guard** watches the finger: if it moves more than 10px, the touch is a
  swipe, and the switch is moved out of the finger's reach so it can't flip.
  The page scrolls, nothing ticks and nothing is pressed.
- **Drags.** WebKit keeps tracking a switch for the whole drag and compares
  the finger with where the switch is *now*. To play a tick mid-drag, haptick
  moves the switch to the other side of the finger, so the next movement
  flips it. That flip is the tick. Bursts space their ticks a couple of
  movements apart so every flip lands.
- **Timing.** WebKit only starts tracking about 200ms into a touch, so the
  first quarter-second of a very fast flick can't tick. Ticks you request in
  that window wait and play once tracking starts.

Since iOS 26.5, a click from script no longer ticks, which is what most
"iOS haptics" snippets rely on. haptick only ever uses real touches.

### Android

Android has the Vibration API, so each haptic plays as its own
`navigator.vibrate` pattern: short pulses for taps and steps, longer rhythms
for success, warning and error. Firefox on Android and desktop browsers
can't vibrate, so haptick quietly does nothing there.

## Rules for good haptics

1. **Tick on touch, not on outcome.** iOS can only tick under a finger, so the
   tap or drag itself is your feedback. Use `vibrate('success')` for results
   that come later, which plays on Android only.
2. **Don't cancel `touchstart`** on a haptic element. `preventDefault()` on
   touchstart turns off WebKit's switch tracking for the whole touch. Use
   `preventSwipeBack` or `touch-action` instead.
3. **Less is more.** Tick on meaningful steps such as detents, snap points
   and thresholds, not on every pixel.

## Browser support

| Platform | Taps | Drags |
| --- | --- | --- |
| iOS Safari 17.4+ (and every iOS browser) | ✓ | ✓ |
| Android Chrome, Edge, Samsung Internet | ✓ | ✓ |
| Firefox Android, desktop | no-op | no-op |

## Run it locally

```sh
git clone https://github.com/jcruzfff/haptick.git
cd haptick
pnpm install
pnpm dev
```

`pnpm dev` prints two addresses. Open the **phone** one on a phone on the same
Wi-Fi to feel the haptics; desktops can't vibrate.

## License

MIT
