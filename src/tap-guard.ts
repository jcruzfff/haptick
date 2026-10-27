/** Finger travel past which a touch on a tap switch is a swipe, not a tap. */
export const TAP_SLOP_PX = 10;

/** Tells a tap on a tap switch from a swipe that started on it. WebKit clicks
 *  the switch when its touch ends *or is cancelled by a scroll*, and after a
 *  ~200ms hold the thumb follows the finger, so a swipe would otherwise
 *  activate the control and tick as it flips. */
export class TapGuard {
  private origin: { x: number; y: number } | null = null;
  private swiped = false;

  down(x: number, y: number): void {
    this.origin = { x, y };
    this.swiped = false;
  }

  /** True the first time the touch strays past the slop. */
  move(x: number, y: number): boolean {
    if (!this.origin || this.swiped) return false;
    if (Math.hypot(x - this.origin.x, y - this.origin.y) <= TAP_SLOP_PX) return false;
    this.swiped = true;
    return true;
  }

  /** A scroll took the touch over. True if it wasn't already a swipe. */
  cancel(): boolean {
    const wasTap = !this.swiped;
    this.swiped = true;
    return wasTap;
  }

  /** Whether the click that ends this touch is a real tap; resets the guard. */
  acceptClick(): boolean {
    const tap = !this.swiped;
    this.origin = null;
    this.swiped = false;
    return tap;
  }
}
