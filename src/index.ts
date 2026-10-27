export { attachTap, type TapOptions } from './tap';
export { attachDrag, type DragOptions, type HapticDrag } from './drag';
export { preventSwipeBack, SWIPE_BACK_GUARD_MOVES, type SwipeBackOptions } from './swipe-back';
export {
  hapticEngine,
  isMuted,
  onMutedChange,
  setMuted,
  vibrate,
  type HapticEngine,
} from './engine';
export {
  PRESETS,
  resolveHaptic,
  type Haptic,
  type HapticPattern,
  type HapticPreset,
} from './presets';
export { HAPTIC_SWITCH_SELECTOR } from './switch';

// Lower-level building blocks, for wiring haptics into your own components.
export { TAP_SLOP_PX, TapGuard } from './tap-guard';
export {
  SWITCH_TRACKING_ARM_MS,
  SwitchDragTicker,
  switchFlipPlacement,
  switchHoldPlacement,
  type SwitchDragStep,
  type SwitchPlacement,
} from './ticker';
