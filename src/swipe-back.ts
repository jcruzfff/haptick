/** Touchmoves of each touch to cancel so iOS Safari can't start its edge
 *  swipe-back. Cancelling the touchstart blocks it too, but also cancels a
 *  haptic switch's tracking for the whole touch (WebKit skips default
 *  handlers on a cancelled event). The switch ignores these early moves
 *  anyway: it only starts tracking ~200ms in. */
export const SWIPE_BACK_GUARD_MOVES = 3;

export interface SwipeBackOptions {
  /** How many moves of each touch to cancel. Default 3. */
  moves?: number;
}

/** Stops a horizontal drag that starts near the screen edge from turning into
 *  Safari's back gesture, without silencing haptics on that drag. Never
 *  `preventDefault()` a touchstart over a haptic surface; use this instead.
 *  Returns a function that removes the guard. */
export function preventSwipeBack(
  element: HTMLElement,
  { moves = SWIPE_BACK_GUARD_MOVES }: SwipeBackOptions = {},
): () => void {
  let cancelled = 0;
  const start = () => {
    cancelled = 0;
  };
  const move = (event: TouchEvent) => {
    if (cancelled >= moves || !event.cancelable) return;
    event.preventDefault();
    cancelled += 1;
  };
  element.addEventListener('touchstart', start, { passive: true });
  element.addEventListener('touchmove', move, { passive: false });
  return () => {
    element.removeEventListener('touchstart', start);
    element.removeEventListener('touchmove', move);
  };
}
