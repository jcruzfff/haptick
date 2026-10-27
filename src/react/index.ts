import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';
// The core is imported by package name, not path, so the React entry shares
// one copy of the engine and mute state with `haptick` instead of bundling
// its own.
import {
  attachDrag,
  attachTap,
  hapticEngine,
  type DragOptions,
  type Haptic,
  type HapticDrag,
  type HapticEngine,
  type TapOptions,
} from 'haptick';

export * from 'haptick';

const noSubscribe = () => () => undefined;

/** The device's haptic engine; `none` during server rendering and hydration. */
export function useHapticEngine(): HapticEngine {
  return useSyncExternalStore(noSubscribe, hapticEngine, () => 'none');
}

// Effects re-run when a custom pattern changes, not on every new object.
const keyOf = (haptic: Haptic | undefined) =>
  typeof haptic === 'object' ? JSON.stringify(haptic) : haptic;

export interface UseHapticTapOptions extends TapOptions {
  /** Detach while true, for blocks the DOM can't see. */
  disabled?: boolean;
}

/** Tap haptics on the element in `ref`. */
export function useHapticTap(
  ref: RefObject<HTMLElement | null>,
  { haptic, debug = false, disabled = false }: UseHapticTapOptions = {},
): void {
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;
  const hapticKey = keyOf(haptic);
  useEffect(() => {
    const host = ref.current;
    if (!host || disabled) return;
    return attachTap(host, { haptic: hapticRef.current, debug });
  }, [ref, hapticKey, debug, disabled]);
}

/** Drop inside any positioned element (a button, tab, card) to give it tap
 *  haptics, without a ref:
 *  `<button>Buy<HapticTap haptic="medium" /></button>` */
export function HapticTap({ haptic, debug = false, disabled = false }: UseHapticTapOptions) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;
  const hapticKey = keyOf(haptic);
  useEffect(() => {
    const host = anchorRef.current?.parentElement;
    if (!host || disabled) return;
    return attachTap(host, { haptic: hapticRef.current, debug });
  }, [hapticKey, debug, disabled]);
  return createElement('span', { ref: anchorRef, hidden: true });
}

export type UseHapticDrag = Pick<HapticDrag, 'begin' | 'tick' | 'end'>;

/** Drag haptics on the surface in `ref`. Call `tick()` from your move
 *  handler; the returned object is stable across renders. */
export function useHapticDrag(
  ref: RefObject<HTMLElement | null>,
  {
    passTaps = false,
    zIndex,
    catchTouches = false,
    moveGap,
    autoBegin = true,
    debug = false,
  }: DragOptions = {},
): UseHapticDrag {
  const dragRef = useRef<HapticDrag | null>(null);
  useEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    const drag = attachDrag(surface, { passTaps, zIndex, catchTouches, moveGap, autoBegin, debug });
    dragRef.current = drag;
    return () => {
      drag.destroy();
      if (dragRef.current === drag) dragRef.current = null;
    };
  }, [ref, passTaps, zIndex, catchTouches, moveGap, autoBegin, debug]);
  return useMemo(
    () => ({
      begin: () => dragRef.current?.begin(),
      tick: (haptic?: Haptic) => dragRef.current?.tick(haptic),
      end: () => dragRef.current?.end(),
    }),
    [],
  );
}
