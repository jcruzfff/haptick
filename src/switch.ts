/* The invisible native switch laid over a tappable or draggable element.
 * iOS ticks only when a real touch lands on an `<input type=checkbox switch>`,
 * so the switch has to be the touch target; its pointer events and clicks
 * still bubble to the host. */

import { isMuted, onMutedChange } from './engine';
import type { SwitchPlacement } from './ticker';
import type { TapGuard } from './tap-guard';

/** Matches haptick's switches. Gesture code that ignores touches starting on
 *  an `input` must exempt these, or every gesture over one is dropped:
 *  `target.closest(\`input:not(${HAPTIC_SWITCH_SELECTOR})\`)`. */
export const HAPTIC_SWITCH_SELECTOR = '[data-haptick]';

/** Hosts that ignore taps: their switch gets no pointer events. */
export const INERT_HOST = ":disabled, [aria-disabled='true'], [aria-busy='true']";

// Far enough that a parked switch box lies wholly on one side of any finger.
const PARK_DISTANCE_PX = 10_000;

const BASE_STYLE = [
  'position:absolute',
  'inset:0',
  'z-index:2',
  'width:100%',
  'height:100%',
  'margin:0',
  'padding:0',
  'border:0',
  'appearance:auto',
  '-webkit-appearance:auto',
  'opacity:0',
  'cursor:inherit',
  '-webkit-tap-highlight-color:transparent',
].join(';');

// A disabled, aria-disabled or busy host gets no tick: the tap falls through
// to the host, which ignores it as before.
const SHEET = `${INERT_HOST.split(', ')
  .map((host) => `${host} > ${HAPTIC_SWITCH_SELECTOR}`)
  .join(',')}{pointer-events:none!important}`;

const sheetDocs = new WeakSet<Document>();

/** Constructed sheets aren't blocked by a `style-src` CSP; a `<style>` tag is
 *  the fallback for older engines. */
function injectSheet(doc: Document): void {
  if (sheetDocs.has(doc)) return;
  sheetDocs.add(doc);
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SHEET);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = SHEET;
    doc.head.appendChild(style);
  }
}

const live = new Set<HTMLInputElement>();
let unwatchMute: (() => void) | null = null;

function applyPointerEvents(input: HTMLInputElement): void {
  input.style.pointerEvents = isMuted()
    ? 'none'
    : input.dataset.haptickCatch === ''
      ? 'auto'
      : '';
}

export interface SwitchOptions {
  drag?: boolean;
  zIndex?: number;
  catchTouches?: boolean;
  debug?: boolean;
}

export function createSwitch({
  drag = false,
  zIndex,
  catchTouches = false,
  debug = false,
}: SwitchOptions = {}): HTMLInputElement {
  injectSheet(document);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.setAttribute('data-haptick', drag ? 'drag' : 'tap');
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;
  // CSSOM, not a style attribute, so a strict CSP doesn't block it.
  input.style.cssText = BASE_STYLE;
  // Drag surfaces own the gesture; their switch must not start a scroll.
  input.style.touchAction = drag ? 'none' : 'manipulation';
  if (zIndex !== undefined) input.style.zIndex = String(zIndex);
  if (catchTouches) input.dataset.haptickCatch = '';
  if (debug) input.style.opacity = '0.6';
  applyPointerEvents(input);
  live.add(input);
  unwatchMute ??= onMutedChange(() => live.forEach(applyPointerEvents));
  return input;
}

export function removeSwitch(input: HTMLInputElement): void {
  live.delete(input);
  input.remove();
  if (live.size === 0) {
    unwatchMute?.();
    unwatchMute = null;
  }
}

/** The switch fills its host, so the host must be a containing block. */
export function ensurePositioned(host: HTMLElement): void {
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
}

/** Read direction from markup, not computed style: no style flush on touch-down. */
export function isRtl(input: HTMLInputElement): boolean {
  return input.closest('[dir]')?.getAttribute('dir') === 'rtl';
}

export function park(input: HTMLInputElement, placement: SwitchPlacement): void {
  const x = placement === 'left-of-finger' ? -PARK_DISTANCE_PX : PARK_DISTANCE_PX;
  input.style.transform = `translateX(${x}px)`;
}

export function on<E extends Event>(
  target: EventTarget,
  type: string,
  listener: (event: E) => void,
  options?: AddEventListenerOptions,
): () => void {
  const handler = listener as EventListener;
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Follows one touch at the window level (an ancestor that captures the
 *  pointer stops the switch seeing its own moves), calls `onSwipe` once it
 *  stops being a tap, and `onEnd` when the finger lifts or a scroll takes
 *  over. Ending on the lift, not on WebKit's closing click, matters: an
 *  ancestor can swallow that click, and a switch left parked would never
 *  tick again. Returns the unbind. */
export function watchTouch(
  guard: TapGuard,
  pointerId: number,
  onSwipe: () => void,
  onEnd: () => void,
  onMove?: (x: number, y: number) => void,
): () => void {
  const unbinds = [
    on<PointerEvent>(
      window,
      'pointermove',
      (e) => {
        if (e.pointerId !== pointerId) return;
        onMove?.(e.clientX, e.clientY);
        if (guard.move(e.clientX, e.clientY)) onSwipe();
      },
      { capture: true, passive: true },
    ),
    on<PointerEvent>(
      window,
      'pointerup',
      (e) => {
        if (e.pointerId === pointerId) onEnd();
      },
      { capture: true },
    ),
    on<PointerEvent>(
      window,
      'pointercancel',
      (e) => {
        if (e.pointerId !== pointerId) return;
        guard.cancel();
        onEnd();
      },
      { capture: true },
    ),
  ];
  return () => unbinds.forEach((unbind) => unbind());
}

/** Replays a tap that landed on a drag switch onto whatever sits under it. */
export function forwardTap(input: HTMLInputElement, x: number, y: number): void {
  const before = input.style.pointerEvents;
  input.style.pointerEvents = 'none';
  const target = document.elementFromPoint(x, y);
  input.style.pointerEvents = before;
  target?.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
  );
}
