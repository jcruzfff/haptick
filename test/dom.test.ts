import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachDrag } from '../src/drag';
import { resetHapticEngine, setMuted } from '../src/engine';
import { PRESETS } from '../src/presets';
import { preventSwipeBack } from '../src/swipe-back';
import { attachTap } from '../src/tap';
import { SWITCH_TRACKING_ARM_MS } from '../src/ticker';

type Engine = 'switch' | 'vibrate' | 'none';

function useEngine(engine: Engine) {
  resetHapticEngine();
  window.localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: engine !== 'none' });
  if (engine === 'vibrate') {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(() => true), configurable: true });
  } else {
    Reflect.deleteProperty(navigator, 'vibrate');
  }
  if (engine === 'switch') {
    Object.defineProperty(HTMLInputElement.prototype, 'switch', { value: false, configurable: true });
  } else {
    Reflect.deleteProperty(HTMLInputElement.prototype, 'switch');
  }
}

const pointer = (type: string, x = 0, y = 0, pointerId = 1) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, clientX: x, clientY: y });

let now = 0;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('attachTap on iOS', () => {
  beforeEach(() => useEngine('switch'));

  it('covers the host with a hidden native switch, and removes it on detach', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const detach = attachTap(button);
    const input = button.querySelector('input')!;
    expect(input.type).toBe('checkbox');
    expect(input.hasAttribute('switch')).toBe(true);
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(input.tabIndex).toBe(-1);
    expect(input.style.opacity).toBe('0');
    expect(button.style.position).toBe('relative');
    detach();
    expect(button.querySelector('input')).toBeNull();
  });

  it('lets a tap reach the host', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    attachTap(button);
    const input = button.querySelector('input')!;
    input.dispatchEvent(pointer('pointerdown', 50, 20));
    window.dispatchEvent(pointer('pointerup', 52, 21));
    input.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a swipe that started on the switch from activating the host', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    attachTap(button);
    const input = button.querySelector('input')!;
    input.dispatchEvent(pointer('pointerdown', 50, 20));
    window.dispatchEvent(pointer('pointermove', 90, 20));
    // Parked out of reach, so the swiping finger can't flip it.
    expect(input.style.transform).toMatch(/translateX/);
    window.dispatchEvent(pointer('pointercancel', 90, 20));
    expect(input.style.transform).toBe('');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    input.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores a second attach to the same element, and allows one again after detach', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const detach = attachTap(button);
    attachTap(button)();
    expect(button.querySelectorAll('input')).toHaveLength(1);
    detach();
    const again = attachTap(button);
    expect(button.querySelectorAll('input')).toHaveLength(1);
    again();
  });

  it('styles switches inside a shadow root, not just the main document', () => {
    const host = document.body.appendChild(document.createElement('div'));
    const root = host.attachShadow({ mode: 'open' });
    const button = root.appendChild(document.createElement('button'));
    attachTap(button);
    expect(button.querySelector('input')).not.toBeNull();
    const styled = (root.adoptedStyleSheets?.length ?? 0) > 0 || root.querySelector('style') !== null;
    expect(styled).toBe(true);
  });

  it('takes no touches while muted', () => {
    const button = document.body.appendChild(document.createElement('button'));
    attachTap(button);
    const input = button.querySelector('input')!;
    setMuted(true);
    expect(input.style.pointerEvents).toBe('none');
    setMuted(false);
    expect(input.style.pointerEvents).toBe('');
  });
});

describe('attachTap on Android', () => {
  beforeEach(() => useEngine('vibrate'));

  it('vibrates on click with the haptic pattern and adds no switch', () => {
    const button = document.body.appendChild(document.createElement('button'));
    attachTap(button, { haptic: 'success' });
    expect(button.querySelector('input')).toBeNull();
    button.click();
    expect(navigator.vibrate).toHaveBeenCalledWith(PRESETS.success.vibrate);
  });

  it('stays quiet for disabled hosts, when muted, and once detached', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const detach = attachTap(button);
    button.setAttribute('aria-disabled', 'true');
    button.click();
    button.removeAttribute('aria-disabled');
    setMuted(true);
    button.click();
    setMuted(false);
    detach();
    button.click();
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
});

describe('attachTap without haptics', () => {
  it('does nothing on desktop', () => {
    useEngine('none');
    const button = document.body.appendChild(document.createElement('button'));
    attachTap(button)();
    expect(button.querySelector('input')).toBeNull();
    expect(button.style.position).toBe('');
  });
});

describe('attachDrag on iOS', () => {
  beforeEach(() => useEngine('switch'));

  it('starts on touch-down and moves the switch under the finger to play a tick once tracking arms', () => {
    const surface = document.body.appendChild(document.createElement('div'));
    const drag = attachDrag(surface);
    const input = drag.element!;
    expect(input.style.touchAction).toBe('none');
    input.dispatchEvent(pointer('pointerdown', 10, 10));
    drag.tick();
    expect(input.style.transform).toBe('');
    now += SWITCH_TRACKING_ARM_MS;
    window.dispatchEvent(pointer('pointermove', 20, 10));
    expect(input.style.transform).toBe('translateX(-10000px)');
    window.dispatchEvent(pointer('pointerup', 20, 10));
    expect(input.style.transform).toBe('');
  });

  it('returns the existing drag when a surface is attached twice', () => {
    const surface = document.body.appendChild(document.createElement('div'));
    const drag = attachDrag(surface);
    expect(attachDrag(surface)).toBe(drag);
    expect(surface.querySelectorAll('input')).toHaveLength(1);
    drag.destroy();
    expect(attachDrag(surface)).not.toBe(drag);
  });

  it('ignores ticks with no drag in progress', () => {
    const surface = document.body.appendChild(document.createElement('div'));
    const drag = attachDrag(surface);
    now += SWITCH_TRACKING_ARM_MS;
    drag.tick('burst');
    window.dispatchEvent(pointer('pointermove'));
    expect(drag.element!.style.transform).toBe('');
  });

  it("swallows WebKit's end-of-drag click unless taps pass through", () => {
    const surface = document.body.appendChild(document.createElement('div'));
    const onClick = vi.fn();
    surface.addEventListener('click', onClick);
    const drag = attachDrag(surface);
    drag.element!.click();
    expect(onClick).not.toHaveBeenCalled();
    drag.destroy();
    expect(surface.querySelector('input')).toBeNull();
  });

  it('forwards a plain tap to whatever sits under the surface', () => {
    const surface = document.body.appendChild(document.createElement('div'));
    const tile = surface.appendChild(document.createElement('button'));
    const onTile = vi.fn();
    tile.addEventListener('click', onTile);
    const drag = attachDrag(surface, { passTaps: true });
    document.elementFromPoint = vi.fn(() => tile);
    drag.element!.dispatchEvent(pointer('pointerdown', 30, 30));
    window.dispatchEvent(pointer('pointerup', 31, 30));
    drag.element!.click();
    expect(onTile).toHaveBeenCalledTimes(1);

    drag.element!.dispatchEvent(pointer('pointerdown', 30, 30));
    window.dispatchEvent(pointer('pointermove', 90, 30));
    window.dispatchEvent(pointer('pointerup', 90, 30));
    drag.element!.click();
    expect(onTile).toHaveBeenCalledTimes(1);
  });
});

describe('attachDrag on Android', () => {
  it('vibrates each tick right away', () => {
    useEngine('vibrate');
    const drag = attachDrag(document.body.appendChild(document.createElement('div')));
    expect(drag.element).toBeNull();
    drag.tick('burst');
    drag.tick();
    expect(navigator.vibrate).toHaveBeenNthCalledWith(1, PRESETS.burst.vibrate);
    expect(navigator.vibrate).toHaveBeenNthCalledWith(2, PRESETS.tick.vibrate);
  });
});

describe('preventSwipeBack', () => {
  const touch = (type: string) => new Event(type, { bubbles: true, cancelable: true });

  it('cancels only the first moves of each touch, never the touchstart', () => {
    const el = document.body.appendChild(document.createElement('div'));
    preventSwipeBack(el);
    const start = touch('touchstart');
    el.dispatchEvent(start);
    expect(start.defaultPrevented).toBe(false);
    const moves = Array.from({ length: 5 }, () => {
      const move = touch('touchmove');
      el.dispatchEvent(move);
      return move.defaultPrevented;
    });
    expect(moves).toEqual([true, true, true, false, false]);
    el.dispatchEvent(touch('touchstart'));
    const next = touch('touchmove');
    el.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(true);
  });
});
