import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetHapticEngine } from '../src/engine';
import { HapticTap, useHapticDrag } from '../src/react';

beforeEach(() => {
  resetHapticEngine();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  Reflect.deleteProperty(navigator, 'vibrate');
  Object.defineProperty(HTMLInputElement.prototype, 'switch', { value: false, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(HTMLInputElement.prototype, 'switch');
});

describe('React bindings', () => {
  it('HapticTap gives its parent a switch and removes it on unmount', () => {
    const { container, unmount } = render(
      <button>
        Buy
        <HapticTap haptic="medium" />
      </button>,
    );
    expect(container.querySelector('button > input[switch]')).not.toBeNull();
    unmount();
    expect(container.querySelector('input')).toBeNull();
  });

  it('HapticTap detaches while disabled', () => {
    const { container, rerender } = render(
      <button>
        <HapticTap />
      </button>,
    );
    rerender(
      <button>
        <HapticTap disabled />
      </button>,
    );
    expect(container.querySelector('input')).toBeNull();
  });

  it('useHapticDrag attaches to the surface and returns stable controls', () => {
    const seen: unknown[] = [];
    function Slider() {
      const ref = useRef<HTMLDivElement>(null);
      const drag = useHapticDrag(ref);
      seen.push(drag);
      return <div ref={ref} onPointerMove={() => drag.tick()} />;
    }
    const { container, rerender } = render(<Slider />);
    rerender(<Slider />);
    expect(container.querySelector('div > input[data-haptick="drag"]')).not.toBeNull();
    expect(seen[0]).toBe(seen[1]);
    act(() => {
      (seen[0] as { tick(): void }).tick();
    });
  });
});
