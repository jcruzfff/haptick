import { describe, expect, it } from 'vitest';
import { PRESETS, resolveHaptic } from '../src/presets';
import { TAP_SLOP_PX, TapGuard } from '../src/tap-guard';
import {
  SWITCH_TRACKING_ARM_MS,
  SwitchDragTicker,
  switchFlipPlacement,
  switchHoldPlacement,
} from '../src/ticker';

const IOS_DRAG_TICKS = Object.fromEntries(
  Object.entries(PRESETS).map(([name, preset]) => [name, preset.iosTicks]),
) as Record<keyof typeof PRESETS, number>;

const ARMED = SWITCH_TRACKING_ARM_MS;
const place = (placement: 'left-of-finger' | 'right-of-finger') => ({ kind: 'place', placement });
const none = { kind: 'none' };

describe('switch flip placement', () => {
  it('parks the box left of the finger to flip an off switch and right of it to flip it back', () => {
    expect(switchFlipPlacement(false)).toBe('left-of-finger');
    expect(switchFlipPlacement(true)).toBe('right-of-finger');
  });

  it('mirrors for right-to-left switches, whose off thumb sits right', () => {
    expect(switchFlipPlacement(false, true)).toBe('right-of-finger');
    expect(switchFlipPlacement(true, true)).toBe('left-of-finger');
  });

  it('holds the thumb still by parking on the side opposite the flip', () => {
    for (const on of [false, true]) {
      for (const rtl of [false, true]) {
        expect(switchHoldPlacement(on, rtl)).not.toBe(switchFlipPlacement(on, rtl));
      }
    }
  });
});

describe('switch drag ticker', () => {
  it('releases a tick requested mid-drag on the same move, starting from the checked state', () => {
    const ticker = new SwitchDragTicker();
    ticker.begin(0, true);
    expect(ticker.move(ARMED)).toEqual({ kind: 'park', placement: 'left-of-finger' });
    expect(ticker.request(ARMED)).toEqual(place('right-of-finger'));
    expect(ticker.move(ARMED + 10)).toEqual(none);
    expect(ticker.move(ARMED + 20)).toEqual(none);
    expect(ticker.request(ARMED + 20)).toEqual(place('left-of-finger'));
  });

  it('parks the switch out of reach on the first armed move, so a drag across it cannot flip it', () => {
    const ticker = new SwitchDragTicker();
    ticker.begin(0, false);
    expect(ticker.move(ARMED - 1)).toEqual(none);
    expect(ticker.move(ARMED)).toEqual({ kind: 'park', placement: switchHoldPlacement(false) });
    expect(ticker.move(ARMED + 1)).toEqual(none);
    expect(ticker.request(ARMED + 2)).toEqual(place(switchFlipPlacement(false)));
  });

  it('skips parking when a tick is already waiting, and parks again next drag', () => {
    const ticker = new SwitchDragTicker();
    ticker.begin(0, false);
    ticker.request(0);
    expect(ticker.move(ARMED)).toEqual(place('left-of-finger'));
    expect(ticker.move(ARMED + 1)).toEqual(none);
    ticker.end();
    ticker.begin(1000, true);
    expect(ticker.move(1000 + ARMED)).toEqual({ kind: 'park', placement: 'left-of-finger' });
  });

  it('holds ticks until tracking arms, so a touch-down haptic lands on the first move after', () => {
    const ticker = new SwitchDragTicker();
    ticker.begin(100, false);
    expect(ticker.request(100)).toEqual(none);
    expect(ticker.move(110)).toEqual(none);
    expect(ticker.move(100 + ARMED - 1)).toEqual(none);
    expect(ticker.move(100 + ARMED)).toEqual(place('left-of-finger'));
    expect(ticker.move(100 + ARMED + 10)).toEqual(none);
  });

  it('never leapfrogs twice inside the move gap, so a flip can land before the next one', () => {
    const ticker = new SwitchDragTicker({ moveGap: 2 });
    ticker.begin(0, false);
    expect(ticker.request(ARMED)).toEqual(place('left-of-finger'));
    ticker.move(ARMED + 1);
    expect(ticker.request(ARMED + 1)).toEqual(none);
    expect(ticker.move(ARMED + 2)).toEqual(place('right-of-finger'));
  });

  it('spreads a burst across moves by the move gap', () => {
    const ticker = new SwitchDragTicker({ moveGap: 2 });
    ticker.begin(0, false);
    const first = ticker.request(ARMED, IOS_DRAG_TICKS.burst);
    const rest = Array.from({ length: 6 }, (_, i) => ticker.move(ARMED + 1 + i));
    expect([first, ...rest]).toEqual([
      place('left-of-finger'),
      none,
      place('right-of-finger'),
      none,
      place('left-of-finger'),
      none,
      none,
    ]);
  });

  it('can release a burst on every move', () => {
    const ticker = new SwitchDragTicker({ moveGap: 1 });
    ticker.begin(0, false);
    expect(ticker.request(ARMED, 2)).toEqual(place('left-of-finger'));
    expect(ticker.move(ARMED + 1)).toEqual(place('right-of-finger'));
    expect(ticker.move(ARMED + 2)).toEqual(none);
  });

  it('caps the queue so a backlog of ticks cannot run on after the moment', () => {
    const ticker = new SwitchDragTicker({ moveGap: 1 });
    ticker.begin(0, false);
    const steps = [ticker.request(ARMED, 10)];
    for (let i = 1; i < 10; i += 1) steps.push(ticker.move(ARMED + i));
    expect(steps.filter((step) => step.kind === 'place')).toHaveLength(4);
  });

  it('never stacks single ticks, so a fast drag never trails the finger', () => {
    const ticker = new SwitchDragTicker({ moveGap: 2 });
    ticker.begin(0, false);
    expect(ticker.request(ARMED)).toEqual(place('left-of-finger'));
    // Five more ticks inside the move gap collapse into one waiting tick.
    for (let i = 0; i < 5; i += 1) expect(ticker.request(ARMED)).toEqual(none);
    const after = Array.from({ length: 6 }, (_, i) => ticker.move(ARMED + 1 + i));
    expect(after.filter((step) => step.kind === 'place')).toHaveLength(1);
  });

  it('lets a burst replace waiting ticks, so a burst plays in full right away', () => {
    const ticker = new SwitchDragTicker({ moveGap: 2 });
    ticker.begin(0, false);
    ticker.request(ARMED);
    ticker.request(ARMED); // a step tick waiting on the gap
    ticker.request(ARMED, IOS_DRAG_TICKS.burst);
    const after = Array.from({ length: 8 }, (_, i) => ticker.move(ARMED + 1 + i));
    expect(after.filter((step) => step.kind === 'place')).toHaveLength(IOS_DRAG_TICKS.burst);
  });

  it('drops queued ticks when the drag ends and restarts from the switch state', () => {
    const ticker = new SwitchDragTicker();
    ticker.begin(0, false);
    ticker.request(0, 3);
    ticker.end();
    expect(ticker.move(ARMED)).toEqual(none);
    expect(ticker.request(ARMED)).toEqual(none);

    ticker.begin(1000, true);
    expect(ticker.request(1000 + ARMED)).toEqual(place('right-of-finger'));
  });

});

describe('presets', () => {
  it('plays heavier haptics as more ticks', () => {
    expect(IOS_DRAG_TICKS.tick).toBe(1);
    expect(IOS_DRAG_TICKS.burst).toBeGreaterThan(IOS_DRAG_TICKS.tick);
    expect(IOS_DRAG_TICKS.error).toBeGreaterThan(IOS_DRAG_TICKS.success);
  });

  it('clamps custom patterns to between one and four iOS ticks', () => {
    expect(resolveHaptic({ vibrate: 5 }).iosTicks).toBe(1);
    expect(resolveHaptic({ vibrate: 5, iosTicks: 0 }).iosTicks).toBe(1);
    expect(resolveHaptic({ vibrate: 5, iosTicks: 9 }).iosTicks).toBe(4);
    expect(resolveHaptic({ vibrate: [5, 10, 5], iosTicks: 2 })).toEqual({
      vibrate: [5, 10, 5],
      iosTicks: 2,
    });
  });

  it('falls back to a light tick for an unknown name', () => {
    expect(resolveHaptic('nope' as never)).toBe(PRESETS.light);
  });
});

describe('tap guard', () => {
  it('accepts a tap that stays within the slop', () => {
    const guard = new TapGuard();
    guard.down(100, 100);
    expect(guard.move(100 + TAP_SLOP_PX, 100)).toBe(false);
    expect(guard.acceptClick()).toBe(true);
  });

  it('rejects the click that ends a swipe and reports the swipe once', () => {
    const guard = new TapGuard();
    guard.down(100, 100);
    expect(guard.move(100 + TAP_SLOP_PX + 1, 100)).toBe(true);
    expect(guard.move(160, 100)).toBe(false);
    expect(guard.acceptClick()).toBe(false);
  });

  it('rejects the click WebKit sends when a scroll cancels the touch', () => {
    const guard = new TapGuard();
    guard.down(100, 100);
    expect(guard.cancel()).toBe(true);
    expect(guard.acceptClick()).toBe(false);
  });

  it('starts fresh for the next touch and accepts clicks with no touch at all', () => {
    const guard = new TapGuard();
    guard.down(0, 0);
    guard.move(50, 50);
    guard.acceptClick();
    expect(guard.acceptClick()).toBe(true);
    guard.down(10, 10);
    expect(guard.acceptClick()).toBe(true);
  });
});
