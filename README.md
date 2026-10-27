# haptick

**Real haptic feedback for the mobile web, including iPhone.**

Safari on iOS has no Vibration API, so most web haptics libraries do nothing on
an iPhone. haptick gets real Taptic Engine ticks out of iOS Safari for both
**taps** and **drags** (sliders, carousels, swipe-to-confirm), and uses
`navigator.vibrate` on Android.

- **Works on iPhone.** Taps tick, and drags tick as often as you like while the finger moves.
- **Android support,** with distinct vibration patterns per haptic.
- **Doesn't break scrolling.** A swipe that starts on a button scrolls the page and never presses the button.
- **Tiny, with no dependencies.** About 3 KB gzipped, plus optional React bindings.
- **Safe everywhere else.** It does nothing on desktop or during server rendering, and is easy to mute.

**[Try the demo on your phone →](https://jcruzfff.github.io/haptick/)**

```sh
npm install haptick
```

## Quick start

### Buttons

```ts
import { attachTap } from 'haptick';

attachTap(document.querySelector('#buy')!, { haptic: 'medium' });
```

That's it. Clicks still reach your button as usual.

### Drags

Call `tick()` from your own move handler whenever something happens: a step, a
snap point, the end of a track.

```ts
import { attachDrag } from 'haptick';

const slider = document.querySelector('#slider')!;
const haptics = attachDrag(slider);

slider.addEventListener('pointermove', (e) => {
  const step = stepAt(e.clientX);
  if (step !== lastStep) haptics.tick(step === 0 || step === MAX ? 'error' : 'tick');
  lastStep = step;
});
```

### React

```tsx
import { HapticTap, useHapticDrag } from 'haptick/react';

function BuyButton() {
  return (
    <button onClick={buy}>
      Buy
      <HapticTap haptic="medium" />
    </button>
  );
}

function Slider() {
  const ref = useRef<HTMLDivElement>(null);
  const haptics = useHapticDrag(ref);
  return <div ref={ref} onPointerMove={() => haptics.tick()} />;
}
```

`haptick/react` re-exports everything from `haptick`, and it ships with
`'use client'` so it works in Next.js server components trees.

## Haptics

| Name        | Android vibration   | iOS drag   | Use it for                     |
| ----------- | ------------------- | ---------- | ------------------------------ |
| `selection` | 6ms                 | 1 tick     | picking from a set, tabs       |
| `tick`      | 8ms                 | 1 tick     | slider steps, detents          |
| `light`     | 10ms                | 1 tick     | ordinary buttons (the default) |
| `medium`    | 16ms                | 1 tick     | primary actions                |
| `heavy`     | 28ms                | 2 ticks    | crossing a threshold           |
| `success`   | 12 · 60 · 24        | 2 ticks    | something worked               |
| `warning`   | 24 · 80 · 24        | 2 ticks    | destructive choices            |
| `error`     | 30 · 50 · 30 · 50 · 30 | 3 ticks | hitting a wall, a failure      |
| `burst`     | 14 · 40 · 18 · 40 · 34 | 3 ticks | a drag's big payoff            |

Or define your own pattern:

```ts
haptics.tick({ vibrate: [10, 30, 10], iosTicks: 2 });
```

iOS can't change how strong a tick is, so stronger haptics play as a quick
burst of ticks during a drag. A tap on iOS is always a single tick.

## API

### `attachTap(element, options?) → detach()`

Adds tap haptics to a button, link, tab, chip or card.

| Option   | Default   | |
| -------- | --------- | --- |
| `haptic` | `'light'` | Android vibration. iOS always plays one tick. |
| `debug`  | `false`   | Show the hidden switch. |

Disabled, `aria-disabled="true"` and `aria-busy="true"` elements are skipped
automatically. A static element is made `position: relative`, because the
switch has to cover it.

### `attachDrag(surface, options?) → HapticDrag`

Adds drag haptics to a slider, carousel, scrubber or any surface you drag on.

| Option         | Default | |
| -------------- | ------- | --- |
| `passTaps`     | `false` | Pass a plain tap through to whatever is under the surface. Without this, the switch swallows clicks. |
| `zIndex`       | `2`     | Put the switch above the surface's own stacked children. |
| `catchTouches` | `false` | Take touches even inside a `pointer-events: none` parent. |
| `moveGap`      | `2`     | Finger moves between the ticks of a burst. |
| `autoBegin`    | `true`  | Start on touch-down. Turn it off to call `begin()` yourself. |
| `debug`        | `false` | Show the hidden switch so you can watch it flip. |

The returned object has:

- `tick(haptic = 'tick')`: play a haptic now. It plays on the next finger movement on iOS.
- `begin()` and `end()`: drags start on touch-down and end on lift by themselves.
- `destroy()`: remove the haptics.

### `vibrate(haptic)`

This plays a haptic without a touch, for example when a server confirms an
order. **It only works on Android.** iOS can only tick under a finger, so give
the tap that started the action its own haptic.

### `preventSwipeBack(element, { moves: 3 }) → remove()`

This stops a horizontal drag that starts at the screen edge from triggering
Safari's back gesture. Use it instead of `preventDefault()` on `touchstart`,
because that would silence the drag's haptics.

### Muting and detection

```ts
import { hapticEngine, isMuted, setMuted, onMutedChange } from 'haptick';

hapticEngine(); // 'switch' (iOS) | 'vibrate' (Android) | 'none'
setMuted(true); // remembered in localStorage and synced across tabs
```

In React, `useHapticEngine()` returns `'none'` during server rendering and
hydration, so markup always matches.

### Gesture libraries

Some gesture code ignores touches that start on an `<input>`. Exempt
haptick's switches, or your gestures will never start on iOS:

```ts
import { HAPTIC_SWITCH_SELECTOR } from 'haptick';

if (target.closest(`input:not(${HAPTIC_SWITCH_SELECTOR})`)) return;
```

## How it works on iPhone

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

## Rules for good haptics

1. **Tick on touch, not on outcome.** iOS can only tick under a finger, so the
   tap or drag itself is your feedback. Use `vibrate('success')` for results
   that come later, which plays on Android only.
2. **Don't cancel `touchstart`** on a haptic element. `preventDefault()` on
   touchstart turns off WebKit's switch tracking for the whole touch. Use
   `preventSwipeBack` or `touch-action` instead.
3. **Less is more.** Tick on meaningful steps such as detents, snap points
   and thresholds, not on every pixel.

## Good to know

- **Use `event.currentTarget` in click handlers.** On iPhone the tap lands on
  haptick's hidden switch inside your element, so `event.target` is that
  switch. `currentTarget`, React's `onClick` and `addEventListener` on the
  element all work as usual.
- **It relies on WebKit behaviour, not a public iOS API.** If a future iOS
  release changes how switches respond to touch, haptick stops ticking on
  iPhone. Nothing breaks, and your page works exactly as before.
- **Privacy.** haptick makes no network requests and collects nothing. It
  stores a single key, `haptick:muted`, in `localStorage`, and only after
  `setMuted()` is called.
- **Strict CSP.** It works under a strict Content Security Policy: styles go
  through constructed stylesheets and the CSSOM, never inline `style`
  attributes or `eval`.
- **Shadow DOM and iframes** are supported. Attaching twice to the same
  element is a no-op.
- **Accessibility.** The switch is `aria-hidden` and out of the tab order, so
  screen readers and keyboards only ever see your element.

## Browser support

| Platform | Taps | Drags |
| --- | --- | --- |
| iOS Safari 17.4+ (and every iOS browser) | ✓ | ✓ |
| Android Chrome, Edge, Samsung Internet | ✓ | ✓ |
| Firefox Android, desktop | no-op | no-op |

## Run the demo locally

```sh
pnpm install
pnpm dev
```

Then open the printed address on a phone on the same Wi-Fi. Add `?debug` to
see the hidden switches.

## License

MIT
