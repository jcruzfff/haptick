/* The iOS switch-drag tick planner.
 *
 * iOS Safari has no Vibration API, and since iOS 26.5 a script-driven click on
 * an `<input type=checkbox switch>` no longer ticks. What still ticks is
 * WebKit's switch *pointer tracking*: a trusted touch that starts on a switch
 * is tracked for the whole drag, and every time the finger crosses the
 * track's change position the thumb flips and WebKit plays the system haptic,
 * with no user-gesture check
 * (CheckboxInputType::updateIsSwitchVisuallyOnFromAbsoluteLocation →
 * performSwitchVisuallyOnAnimation(SwitchTrigger::PointerTracking)).
 *
 * The finger is mapped into the switch's *current* box on every touchmove, so
 * moving the switch moves the change position. To tick on demand mid-drag we
 * leapfrog the switch past the finger: put its box wholly on the side that
 * makes the thumb flip, and the next finger movement plays the tick. This
 * module is the pure bookkeeping for that dance; it touches no DOM.
 */

import { MAX_IOS_TICKS } from './presets';

/** WebKit starts switch pointer tracking 200ms after touchstart (its held
 *  timer); moving the switch before then would corrupt the tracking origin. */
export const SWITCH_TRACKING_ARM_MS = 260;

/** Finger moves between burst ticks. A flip lands on the touchmove after its
 *  leapfrog, so leapfrogging again on the very next move could undo it. */
export const SWITCH_BURST_MOVE_GAP = 2;

/** Where the switch box sits relative to the finger, physically. WebKit
 *  compares the finger's raw x against the track, whatever the direction. */
export type SwitchPlacement = 'left-of-finger' | 'right-of-finger';

/** The thumb sits left when off in LTR and when on in RTL. */
function thumbIsLeft(visuallyOn: boolean, rtl: boolean): boolean {
  return rtl ? visuallyOn : !visuallyOn;
}

/** Placement that flips the thumb on the next finger movement: the box goes
 *  to the thumb's side, so the finger is past the change position. */
export function switchFlipPlacement(visuallyOn: boolean, rtl = false): SwitchPlacement {
  return thumbIsLeft(visuallyOn, rtl) ? 'left-of-finger' : 'right-of-finger';
}

/** Placement that keeps the thumb where it is however the finger moves. */
export function switchHoldPlacement(visuallyOn: boolean, rtl = false): SwitchPlacement {
  return thumbIsLeft(visuallyOn, rtl) ? 'right-of-finger' : 'left-of-finger';
}

/** `place` flips the thumb on the next finger movement (a tick); `park`
 *  moves the box out of reach so the finger can't flip it by accident. */
export type SwitchDragStep =
  | { kind: 'none' }
  | { kind: 'place'; placement: SwitchPlacement }
  | { kind: 'park'; placement: SwitchPlacement };

export interface SwitchDragTickerOptions {
  rtl?: boolean;
  moveGap?: number;
}

/** Tracks the switch's visual state across one drag. Ticks are released as
 *  leapfrogs once tracking has armed, at most one per `moveGap` finger moves;
 *  extra ticks of a burst queue for later moves. A tick requested mid-move is
 *  released on that same move, so it lands on the next touchmove. Flips are
 *  assumed to land; one that doesn't costs one more tick, then the
 *  alternation re-syncs with the switch on its own. */
export class SwitchDragTicker {
  private active = false;
  private visuallyOn = false;
  private armedAt = 0;
  private queued = 0;
  private movesSincePlace = Number.POSITIVE_INFINITY;
  private parked = false;
  private readonly rtl: boolean;
  private readonly moveGap: number;

  constructor({ rtl = false, moveGap = SWITCH_BURST_MOVE_GAP }: SwitchDragTickerOptions = {}) {
    this.rtl = rtl;
    this.moveGap = Math.max(1, moveGap);
  }

  begin(now: number, checked: boolean): void {
    this.active = true;
    this.visuallyOn = checked;
    this.armedAt = now + SWITCH_TRACKING_ARM_MS;
    this.queued = 0;
    this.movesSincePlace = Number.POSITIVE_INFINITY;
    this.parked = false;
  }

  /** Queues `count` ticks; returns the leapfrog to apply now, if any.
   *  Single ticks never stack: a fast drag drops the ones iOS can't keep up
   *  with rather than trailing behind the finger. A burst replaces whatever
   *  is waiting, so it lands the moment it happens. */
  request(now: number, count = 1): SwitchDragStep {
    if (!this.active) return { kind: 'none' };
    this.queued =
      count > 1 ? Math.min(MAX_IOS_TICKS, count) : Math.max(this.queued, Math.min(1, count));
    return this.release(now);
  }

  /** Call once per finger move, before the move's handlers run. Once
   *  tracking arms, the switch box sits under the finger and a drag across
   *  its midline would flip it; the first armed move with nothing to play
   *  parks it out of reach instead. */
  move(now: number): SwitchDragStep {
    if (!this.active) return { kind: 'none' };
    this.movesSincePlace += 1;
    const step = this.release(now);
    if (step.kind !== 'none' || this.parked || now < this.armedAt) return step;
    this.parked = true;
    return { kind: 'park', placement: switchHoldPlacement(this.visuallyOn, this.rtl) };
  }

  end(): void {
    this.active = false;
    this.queued = 0;
  }

  private release(now: number): SwitchDragStep {
    if (this.queued === 0 || now < this.armedAt || this.movesSincePlace < this.moveGap) {
      return { kind: 'none' };
    }
    this.queued -= 1;
    this.movesSincePlace = 0;
    this.parked = true;
    const placement = switchFlipPlacement(this.visuallyOn, this.rtl);
    this.visuallyOn = !this.visuallyOn;
    return { kind: 'place', placement };
  }
}
