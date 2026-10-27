import { hapticEngine, isMuted, vibrate } from './engine';
import { resolveHaptic, type Haptic } from './presets';
import {
  createSwitch,
  ensurePositioned,
  forwardTap,
  isRtl,
  on,
  park,
  removeSwitch,
  watchTouch,
} from './switch';
import { TapGuard } from './tap-guard';
import { SwitchDragTicker, type SwitchDragStep } from './ticker';

export interface DragOptions {
  /** Replay plain taps onto whatever sits under the surface (tiles, buttons);
   *  otherwise the switch swallows every click it gets. */
  passTaps?: boolean;
  /** z-index over the surface's own stacked children. Default 2. */
  zIndex?: number;
  /** Take touches even inside a `pointer-events: none` host. */
  catchTouches?: boolean;
  /** Finger moves between the ticks of a burst. Default 2. */
  moveGap?: number;
  /** Start tracking when a touch lands on the surface. Default true; turn
   *  it off to call `begin()` yourself. */
  autoBegin?: boolean;
  /** Show the hidden switch, to watch its thumb flip. */
  debug?: boolean;
}

export interface HapticDrag {
  /** The iOS switch, or null on engines that don't need one. */
  readonly element: HTMLInputElement | null;
  /** Start a drag. Called for you on touch-down unless `autoBegin` is off. */
  begin(): void;
  /** Play a haptic mid-drag. Android vibrates now; iOS plays it on the
   *  finger's next movement (heavier presets as a quick burst). */
  tick(haptic?: Haptic): void;
  /** End the drag. Also happens by itself when the finger lifts. */
  end(): void;
  /** Remove the haptics from the surface. */
  destroy(): void;
}

/** Drag haptics for a slider, carousel, scrubber or swipe surface: call
 *  `tick()` from your own move handler whenever something happens (a step,
 *  a snap point, the end of the track).
 *
 *  On iOS the touch must start on the surface's switch, which covers it, so
 *  WebKit tracks the drag; moving that switch under the finger is what makes
 *  each tick. Pointer events still bubble to the surface as usual. */
export function attachDrag(
  surface: HTMLElement,
  {
    passTaps = false,
    zIndex,
    catchTouches = false,
    moveGap,
    autoBegin = true,
    debug = false,
  }: DragOptions = {},
): HapticDrag {
  if (hapticEngine() !== 'switch') {
    return {
      element: null,
      begin: () => undefined,
      tick: (haptic = 'tick') => vibrate(haptic),
      end: () => undefined,
      destroy: () => undefined,
    };
  }

  ensurePositioned(surface);
  const input = createSwitch({ drag: true, zIndex, catchTouches, debug });
  let ticker: SwitchDragTicker | null = null;
  let unbindDrag: (() => void) | null = null;

  const leapfrog = (step: SwitchDragStep) => {
    if (step.kind !== 'none') park(input, step.placement);
  };
  const end = () => {
    unbindDrag?.();
    unbindDrag = null;
    ticker?.end();
    ticker = null;
    input.style.transform = '';
  };
  const begin = () => {
    end();
    if (isMuted()) return;
    const t = new SwitchDragTicker({ rtl: isRtl(input), moveGap });
    t.begin(performance.now(), input.checked);
    ticker = t;
    const unbinds = [
      // Capture phase, so surfaces that stop propagation still count moves,
      // and before the surface's own handlers so their ticks join this move.
      on(window, 'pointermove', () => leapfrog(t.move(performance.now())), {
        capture: true,
        passive: true,
      }),
      // End on the lift too, so a surface that misses its own pointerup
      // can't leave the switch parked out of reach.
      on(window, 'pointerup', end, { capture: true }),
      on(window, 'pointercancel', end, { capture: true }),
    ];
    unbindDrag = () => unbinds.forEach((unbind) => unbind());
  };

  const guard = new TapGuard();
  const last = { x: 0, y: 0 };
  let unwatch: (() => void) | null = null;
  const finishTap = () => {
    unwatch?.();
    unwatch = null;
  };

  const unbinds = [
    on<PointerEvent>(input, 'pointerdown', (e) => {
      if (autoBegin) begin();
      if (!passTaps) return;
      finishTap();
      guard.down(e.clientX, e.clientY);
      last.x = e.clientX;
      last.y = e.clientY;
      unwatch = watchTouch(guard, e.pointerId, () => undefined, finishTap, (x, y) => {
        last.x = x;
        last.y = y;
      });
    }),
    // WebKit clicks the switch at the end of every drag that started on it;
    // the surface's ancestors must not read that as a tap.
    on<MouseEvent>(input, 'click', (e) => {
      e.stopPropagation();
      if (!passTaps) return;
      finishTap();
      if (guard.acceptClick()) forwardTap(input, last.x, last.y);
    }),
  ];
  surface.appendChild(input);

  return {
    element: input,
    begin,
    tick(haptic = 'tick') {
      if (ticker) leapfrog(ticker.request(performance.now(), resolveHaptic(haptic).iosTicks));
    },
    end,
    destroy() {
      end();
      finishTap();
      unbinds.forEach((unbind) => unbind());
      removeSwitch(input);
    },
  };
}
