/** Built-in haptics. On Android each one is a distinct vibration pattern.
 *  iOS can't vary a tick's strength, so during a drag the heavier presets
 *  play as a quick burst of ticks; a tap is always a single tick. */
export type HapticPreset =
  | 'selection'
  | 'tick'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'burst';

/** A custom haptic. `vibrate` is a `navigator.vibrate` pattern (ms on/off);
 *  `iosTicks` is how many ticks an iOS drag plays for it (1–4, default 1). */
export interface HapticPattern {
  vibrate: number | readonly number[];
  iosTicks?: number;
}

export type Haptic = HapticPreset | HapticPattern;

export interface ResolvedHaptic {
  vibrate: number | readonly number[];
  iosTicks: number;
}

/** Most ticks a single haptic can queue on iOS. More than this trails
 *  behind the finger instead of feeling like one moment. */
export const MAX_IOS_TICKS = 4;

export const PRESETS: Readonly<Record<HapticPreset, ResolvedHaptic>> = {
  selection: { vibrate: 6, iosTicks: 1 },
  tick: { vibrate: 8, iosTicks: 1 },
  light: { vibrate: 10, iosTicks: 1 },
  medium: { vibrate: 16, iosTicks: 1 },
  heavy: { vibrate: 28, iosTicks: 2 },
  success: { vibrate: [12, 60, 24], iosTicks: 2 },
  warning: { vibrate: [24, 80, 24], iosTicks: 2 },
  error: { vibrate: [30, 50, 30, 50, 30], iosTicks: 3 },
  // Three rising pulses: the strongest preset, for a drag's big payoff.
  burst: { vibrate: [14, 40, 18, 40, 34], iosTicks: 3 },
};

export function resolveHaptic(haptic: Haptic): ResolvedHaptic {
  if (typeof haptic === 'string') return PRESETS[haptic] ?? PRESETS.light;
  const ticks = Math.round(haptic.iosTicks ?? 1);
  return { vibrate: haptic.vibrate, iosTicks: Math.min(MAX_IOS_TICKS, Math.max(1, ticks)) };
}
