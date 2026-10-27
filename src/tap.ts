import { hapticEngine, vibrate } from './engine';
import type { Haptic } from './presets';
import {
  INERT_HOST,
  createSwitch,
  ensurePositioned,
  injectSheet,
  isRtl,
  on,
  park,
  removeSwitch,
  viewOf,
  watchTouch,
} from './switch';
import { TapGuard } from './tap-guard';
import { switchHoldPlacement } from './ticker';

export interface TapOptions {
  /** Android vibration for the tap. iOS always plays its single system tick. */
  haptic?: Haptic;
  /** Show the hidden switch, to see what takes the touch. */
  debug?: boolean;
}

const noop = () => undefined;

// Attaching twice would stack two switches; the second call is a no-op.
const attached = new WeakSet<HTMLElement>();

/** Tap haptics for a button, tab, chip or card. Returns a function that
 *  removes them.
 *
 *  iOS: an invisible native switch takes the tap, ticks, and lets the click
 *  bubble to the host, but only for real taps, so a scroller of these still
 *  scrolls without activating anything. Android: vibrates on the host's
 *  click. Disabled, aria-disabled and aria-busy hosts are skipped. */
export function attachTap(
  host: HTMLElement,
  { haptic = 'light', debug = false }: TapOptions = {},
): () => void {
  const engine = hapticEngine();
  if (engine === 'none' || attached.has(host)) return noop;
  attached.add(host);
  if (engine === 'vibrate') {
    const off = on(host, 'click', () => {
      if (!host.matches(INERT_HOST)) vibrate(haptic);
    });
    return () => {
      off();
      attached.delete(host);
    };
  }

  ensurePositioned(host);
  const input = createSwitch(host, { debug });
  const guard = new TapGuard();
  let unwatch: (() => void) | null = null;

  // A swipe: park the switch so the finger stays on the thumb's side and
  // can't flip it (no ticks, no visual toggling) while the page scrolls.
  const hold = () => park(input, switchHoldPlacement(input.checked, isRtl(input)));
  const finish = () => {
    unwatch?.();
    unwatch = null;
    input.style.transform = '';
  };

  const unbinds = [
    on<PointerEvent>(input, 'pointerdown', (e) => {
      finish();
      guard.down(e.clientX, e.clientY);
      unwatch = watchTouch(viewOf(input), guard, e.pointerId, hold, finish);
    }),
    // WebKit clicks the switch when the touch ends or a scroll cancels it.
    // Only a real tap reaches the host; preventDefault also undoes the toggle.
    on<MouseEvent>(input, 'click', (e) => {
      finish();
      if (guard.acceptClick()) return;
      e.preventDefault();
      e.stopPropagation();
    }),
  ];
  host.appendChild(input);
  injectSheet(input);

  return () => {
    finish();
    unbinds.forEach((unbind) => unbind());
    removeSwitch(input);
    attached.delete(host);
  };
}
