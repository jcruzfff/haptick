# Contributing

```sh
pnpm install
pnpm test        # unit tests (jsdom)
pnpm type-check
pnpm build       # dist/ for npm
pnpm dev         # demo on your network, for testing on a phone
```

## Testing on a real iPhone

Nothing replaces a real device: jsdom can't produce a Taptic Engine tick.

1. Run `pnpm dev` and open the printed address on an iPhone on the same Wi-Fi.
2. Add `?debug` to the URL to see the hidden switches.
3. To see what each touch did, enable Web Inspector on the phone (Settings →
   Safari → Advanced). Then, on a Mac, open Safari → Develop → your iPhone →
   the page, and paste [`tools/ios-trace.js`](tools/ios-trace.js) into the
   console. Run `__hapticsReport()` after a gesture that didn't tick.

What to check on iOS before a release:

- **Taps.** Every button ticks once, on release.
- **Disabled buttons.** They never tick.
- **Chip strip.** It scrolls freely when the swipe starts on a chip, and nothing gets selected.
- **Slider.** It ticks per mark, plays a double at the centre and a triple at the ends.
- **Swipe to confirm.** Start at the left screen edge: it ticks and finishes with a burst, and Safari doesn't go back.

## Ground rules

- Never `preventDefault()` a `touchstart` over a switch: WebKit then skips
  the switch's tracking for the whole touch, and the drag goes silent.
- The core stays dependency-free and framework-agnostic; framework bindings
  are thin wrappers in their own entry point.
