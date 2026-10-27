import { resolveHaptic, type Haptic } from './presets';

/** How this device can produce haptics:
 *  - `vibrate`: the Vibration API (Android Chrome, Edge, Samsung Internet).
 *  - `switch`: iOS Safari. Only a real touch on a native switch ticks, so
 *    haptics come from `attachTap` / `attachDrag` under the finger.
 *  - `none`: desktop, Firefox Android, server rendering. */
export type HapticEngine = 'vibrate' | 'switch' | 'none';

const MUTED_KEY = 'haptick:muted';

let engine: HapticEngine | null = null;
let muted: boolean | null = null;
const muteListeners = new Set<(muted: boolean) => void>();

function supportsSwitchControl(): boolean {
  if (typeof HTMLInputElement === 'undefined') return false;
  if ('switch' in HTMLInputElement.prototype) return true;
  // Older WebKit without the reflected IDL attribute still renders switches
  // from iOS 17.4; the UA check covers iPhone and touch iPadOS.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform))
  );
}

function hasCoarsePointer(): boolean {
  try {
    return window.matchMedia('(any-pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** The device's haptic engine, detected once and cached. */
export function hapticEngine(): HapticEngine {
  if (engine) return engine;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'none';
  if (!hasCoarsePointer()) engine = 'none';
  else if (typeof navigator.vibrate === 'function') engine = 'vibrate';
  else if (supportsSwitchControl()) engine = 'switch';
  else engine = 'none';
  return engine;
}

/** Testing hook: forget the cached engine (and mute state) so the next call
 *  detects again. */
export function resetHapticEngine(): void {
  engine = null;
  muted = null;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the user turned haptics off. Persisted in localStorage and kept
 *  in sync across tabs. */
export function isMuted(): boolean {
  if (muted === null) {
    if (typeof window === 'undefined') return false;
    muted = readMuted();
    window.addEventListener('storage', (event) => {
      if (event.key !== MUTED_KEY && event.key !== null) return;
      const next = readMuted();
      if (next !== muted) notifyMuted((muted = next));
    });
  }
  return muted;
}

export function setMuted(next: boolean): void {
  if (isMuted() === next) return;
  muted = next;
  try {
    if (next) window.localStorage.setItem(MUTED_KEY, '1');
    else window.localStorage.removeItem(MUTED_KEY);
  } catch {
    /* storage blocked: the cached value still applies to this tab */
  }
  notifyMuted(next);
}

/** Called whenever the mute setting changes, in this tab or another. */
export function onMutedChange(listener: (muted: boolean) => void): () => void {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

function notifyMuted(value: boolean): void {
  for (const listener of muteListeners) listener(value);
}

/** Vibrates on Android. A no-op on iOS, where a tick needs a switch under the
 *  finger, and wherever haptics are unsupported or muted. Use it for
 *  feedback that arrives without a touch, like a server confirming an order. */
export function vibrate(haptic: Haptic): void {
  if (hapticEngine() !== 'vibrate' || isMuted()) return;
  try {
    navigator.vibrate(resolveHaptic(haptic).vibrate as number | number[]);
  } catch {
    /* blocked before the first user activation: haptics are purely additive */
  }
}
