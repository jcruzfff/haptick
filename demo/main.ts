import qrcode from 'qrcode-generator';
import {
  attachDrag,
  attachTap,
  isMuted,
  preventSwipeBack,
  resolveHaptic,
  type Haptic,
  type HapticPreset,
} from '../src/index';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// `?debug` shows the hidden switches, to see what takes each touch.
const debug = new URLSearchParams(location.search).has('debug');

type Point = { x: number; y: number };

// ---- Dot field: every haptic sends a ripple out from the finger
const field = (() => {
  const canvas = $<HTMLCanvasElement>('field');
  const ctx = canvas.getContext('2d')!;
  const GAP = 18;
  const SPEED = 0.55; // px per ms
  const LIFE = 1100;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = 0;
  const ripples: { x: number; y: number; t0: number; strength: number }[] = [];

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw(performance.now());
  }

  function draw(now: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      if (now - ripples[i].t0 > LIFE) ripples.splice(i, 1);
    }
    const ox = (width % GAP) / 2;
    for (let y = GAP / 2; y < height; y += GAP) {
      for (let x = ox; x < width; x += GAP) {
        let glow = 0;
        for (const r of ripples) {
          const age = now - r.t0;
          const radius = age * SPEED;
          const d = Math.hypot(x - r.x, y - r.y) - radius;
          glow += Math.exp(-(d * d) / 900) * (1 - age / LIFE) * r.strength;
        }
        glow = Math.min(1, glow);
        if (glow > 0.02) {
          ctx.fillStyle = `rgba(141, 255, 170, ${0.1 + glow * 0.85})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.1 + glow * 1.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
        }
      }
    }
    frame = ripples.length > 0 ? requestAnimationFrame(draw) : 0;
  }

  addEventListener('resize', resize);
  resize();
  return {
    ripple({ x, y }: Point, ticks: number) {
      if (reducedMotion) return;
      // A burst of ticks overlaps rather than stacking into a solid flash.
      if (ripples.length > 6) ripples.shift();
      ripples.push({ x, y, t0: performance.now(), strength: 0.55 + ticks * 0.15 });
      if (!frame) frame = requestAnimationFrame(draw);
    },
  };
})();

// ---- Feedback you can see: LEDs blink once per tick and the field ripples
function centerOf(el: Element): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const ledTimers = new WeakMap<Element, number[]>();
function blink(tile: Element | null, ticks: number) {
  const leds = tile ? Array.from(tile.querySelectorAll('.leds i')) : [];
  if (!tile || leds.length === 0) return;
  ledTimers.get(tile)?.forEach(clearTimeout);
  const timers: number[] = [];
  leds.forEach((led) => led.classList.remove('on'));
  for (let i = 0; i < Math.min(ticks, leds.length); i += 1) {
    timers.push(window.setTimeout(() => led(leds[i], true), i * 70));
    timers.push(window.setTimeout(() => led(leds[i], false), i * 70 + 140));
  }
  ledTimers.set(tile, timers);
}
const led = (el: Element, on: boolean) => el.classList.toggle('on', on);

function show(haptic: Haptic, from: Element, at?: Point) {
  if (isMuted()) return;
  const { iosTicks } = resolveHaptic(haptic);
  blink(from.closest('.tile'), iosTicks);
  field.ripple(at ?? centerOf(from), iosTicks);
}

/** Tap haptics plus the visible feedback. */
function tap(button: HTMLElement, haptic: Haptic, onTap?: () => void) {
  attachTap(button, { haptic, debug });
  button.addEventListener('click', (e) => {
    if (button.matches(':disabled, [aria-busy="true"]')) return;
    show(haptic, button, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : undefined);
    onTap?.();
  });
}

/** Drag haptics plus the visible feedback. */
function drag(surface: HTMLElement) {
  const haptics = attachDrag(surface, { debug });
  return (haptic: Haptic, at: Point) => {
    haptics.tick(haptic);
    show(haptic, surface, at);
  };
}

// ---- Install command
const install = $<HTMLButtonElement>('install');
tap(install, 'success', () => {
  navigator.clipboard?.writeText('npm i haptick').catch(() => undefined);
  install.classList.add('copied');
  window.setTimeout(() => install.classList.remove('copied'), 1400);
});

// ---- Buttons
document.querySelectorAll<HTMLButtonElement>('#presets [data-haptic]').forEach((button) => {
  tap(button, button.dataset.haptic as HapticPreset);
});

// ---- Drag ticks
const SPACING_PX = 10;
let padHaptic: Haptic = 'tick';
const padChips = document.querySelectorAll<HTMLButtonElement>('#pad-haptic .chip');
padChips.forEach((chip) =>
  tap(chip, 'selection', () => {
    padChips.forEach((c) => c.classList.toggle('on', c === chip));
    padHaptic = chip.dataset.value as HapticPreset;
  }),
);

const pad = $('pad');
const padGlow = $('pad-glow');
const padCount = $('pad-count');
const padTick = drag(pad);
let padPointer: number | null = null;
let padLast: Point = { x: 0, y: 0 };
let padTravel = 0;
let padSteps = 0;
const movePadGlow = (e: PointerEvent) => {
  const r = pad.getBoundingClientRect();
  padGlow.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
};
pad.addEventListener('pointerdown', (e) => {
  padPointer = e.pointerId;
  padLast = { x: e.clientX, y: e.clientY };
  padTravel = padSteps = 0;
  padCount.textContent = '0';
  padCount.classList.add('glow-text');
  pad.classList.add('active');
  movePadGlow(e);
  padTick('light', padLast);
});
pad.addEventListener('pointermove', (e) => {
  if (padPointer !== e.pointerId) return;
  movePadGlow(e);
  padTravel += Math.hypot(e.clientX - padLast.x, e.clientY - padLast.y);
  padLast = { x: e.clientX, y: e.clientY };
  const steps = Math.floor(padTravel / SPACING_PX);
  if (steps === padSteps) return;
  padSteps = steps;
  padCount.textContent = String(steps);
  padTick(padHaptic, padLast);
});
const padEnd = (e: PointerEvent) => {
  if (padPointer !== e.pointerId) return;
  padPointer = null;
  pad.classList.remove('active');
};
pad.addEventListener('pointerup', padEnd);
pad.addEventListener('pointercancel', padEnd);

// ---- Slider: one tick per ruler mark
const MARKS = 20;
const MID = MARKS / 2;
const ruler = $('ruler');
const marks: HTMLElement[] = [];
for (let i = 0; i <= MARKS; i += 1) {
  const mark = document.createElement('i');
  mark.style.left = `${(i / MARKS) * 100}%`;
  if (i === MID) mark.className = 'mid';
  else if (i % 5 === 0) mark.className = 'major';
  ruler.appendChild(mark);
  marks.push(mark);
}

/** The haptic for moving from mark `from` to mark `to`: a triple at either
 *  end, a double crossing the centre, a tick for every other mark. */
function markHaptic(from: number, to: number): Haptic | null {
  if (from === to) return null;
  const crossed = (mark: number) => (to > from ? mark > from && mark <= to : mark < from && mark >= to);
  if (crossed(0) || crossed(MARKS)) return 'error';
  if (crossed(MID)) return 'heavy';
  return 'tick';
}

const slider = $('slider');
const thumb = $('thumb');
const sliderValue = $('slider-value');
const sliderTick = drag(slider);
let sliderPointer: number | null = null;
let sliderMark = MID;
const renderSlider = (fraction: number) => {
  thumb.style.left = `calc(26px + (100% - 52px) * ${fraction})`;
  const mark = Math.round(fraction * MARKS);
  const value = mark - MID;
  sliderValue.textContent = value > 0 ? `+${value}` : String(value);
  sliderValue.classList.toggle('zero', value === 0);
  sliderValue.classList.toggle('glow-text', value !== 0);
  marks.forEach((m, i) => m.classList.toggle('lit', value !== 0 && i >= Math.min(mark, MID) && i <= Math.max(mark, MID)));
};
renderSlider(0.5);
const sliderFraction = (x: number) => {
  const rect = ruler.getBoundingClientRect();
  return clamp((x - rect.left) / rect.width, 0, 1);
};
slider.addEventListener('pointerdown', (e) => {
  sliderPointer = e.pointerId;
  slider.setPointerCapture?.(e.pointerId);
  const fraction = sliderFraction(e.clientX);
  sliderMark = Math.round(fraction * MARKS);
  renderSlider(fraction);
  sliderTick('selection', { x: e.clientX, y: e.clientY });
});
slider.addEventListener('pointermove', (e) => {
  if (sliderPointer !== e.pointerId) return;
  const fraction = sliderFraction(e.clientX);
  const mark = Math.round(fraction * MARKS);
  const haptic = markHaptic(sliderMark, mark);
  sliderMark = mark;
  renderSlider(fraction);
  if (haptic) sliderTick(haptic, { x: e.clientX, y: e.clientY });
});
const sliderEnd = (e: PointerEvent) => {
  if (sliderPointer === e.pointerId) sliderPointer = null;
};
slider.addEventListener('pointerup', sliderEnd);
slider.addEventListener('pointercancel', sliderEnd);

// ---- Carousel: tick per card, bump past the ends, tap to open
const carousel = $('carousel');
const track = $('track');
const CARDS = [
  ['Spring', '1.2x'], ['Ember', '3.0x'], ['Tide', '0.8x'], ['Orbit', '2.4x'],
  ['Signal', '5.1x'], ['Drift', '1.7x'], ['Pulse', '4.2x'], ['Echo', '2.9x'],
] as const;
const PITCH = 148;
const cards = CARDS.map(([name, val], i) => {
  const card = document.createElement('div');
  card.className = i === 0 ? 'card active' : 'card';
  for (const [cls, text] of [['val', val], ['name', name]]) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    card.appendChild(span);
  }
  track.appendChild(card);
  return card;
});
const maxOffset = -(CARDS.length - 1) * PITCH;
const carouselTick = drag(carousel);
let carouselPointer: number | null = null;
let startX = 0;
let startOffset = 0;
let offset = 0;
let index = 0;
let atEnd = false;
const setOffset = (value: number, animate = false) => {
  offset = value;
  track.style.transition = animate ? 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  track.style.transform = `translateX(${value}px)`;
};
const setIndex = (next: number) => {
  index = next;
  cards.forEach((card, i) => card.classList.toggle('active', i === index));
};
carousel.addEventListener('pointerdown', (e) => {
  carouselPointer = e.pointerId;
  carousel.setPointerCapture?.(e.pointerId);
  startX = e.clientX;
  startOffset = offset;
  atEnd = false;
});
carousel.addEventListener('pointermove', (e) => {
  if (carouselPointer !== e.pointerId) return;
  const at = { x: e.clientX, y: e.clientY };
  const raw = startOffset + (e.clientX - startX);
  const over = raw > 0 ? raw : raw < maxOffset ? raw - maxOffset : 0;
  if (over !== 0 && !atEnd) {
    atEnd = true;
    carouselTick('heavy', at);
  } else if (over === 0) {
    atEnd = false;
  }
  setOffset(raw - over * 0.7);
  const next = Math.round(-clamp(offset, maxOffset, 0) / PITCH);
  if (next !== index) {
    setIndex(next);
    carouselTick('tick', at);
  }
});
const carouselEnd = (e: PointerEvent) => {
  if (carouselPointer !== e.pointerId) return;
  carouselPointer = null;
  if (Math.abs(e.clientX - startX) < 8) {
    setOffset(startOffset);
    const r = track.getBoundingClientRect();
    const hit = cards[Math.floor((e.clientX - r.left) / PITCH)];
    if (hit && e.clientY >= r.top && e.clientY <= r.bottom) openSheet(hit.querySelector('.name')!.textContent!);
    return;
  }
  setIndex(Math.round(-clamp(offset, maxOffset, 0) / PITCH));
  setOffset(-index * PITCH, true);
};
carousel.addEventListener('pointerup', carouselEnd);
carousel.addEventListener('pointercancel', carouselEnd);

// ---- Sheet
const sheet = $('sheet');
function openSheet(title: string) {
  $('sheet-title').textContent = title;
  sheet.hidden = false;
}
sheet.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((option) => {
  attachTap(option, { haptic: option.dataset.choice === 'Delete' ? 'warning' : 'selection', debug });
  option.addEventListener('click', () => (sheet.hidden = true));
});
$('sheet-backdrop').addEventListener('click', () => (sheet.hidden = true));

// ---- Scrolling chips
const chips = $('chips');
['All', 'Music', 'Sports', 'Gaming', 'Food', 'Travel', 'Tech', 'Art', 'Film', 'Books'].forEach((name, i) => {
  const chip = document.createElement('button');
  chip.className = i === 0 ? 'chip on' : 'chip';
  chip.textContent = name;
  chips.appendChild(chip);
  tap(chip, 'selection', () => {
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
  });
});

// ---- Swipe to confirm: dense ticks while it fills, a burst when it lands
const confirm = $('confirm');
const fill = $('confirm-fill');
const knob = $('confirm-knob');
const label = $('confirm-label');
const confirmTick = drag(confirm);
preventSwipeBack(confirm);
const KNOB = 76;
const STEP_PX = 12;
let confirmPointer: number | null = null;
let confirmSteps = 0;
let confirmed = false;
const travel = () => confirm.clientWidth - KNOB;
const renderConfirm = (progress: number, animate = false) => {
  const ease = animate ? 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  knob.style.transition = fill.style.transition = ease;
  knob.style.transform = `translateX(${progress * travel()}px)`;
  fill.style.width = `${KNOB + progress * travel()}px`;
};
const confirmProgress = (x: number) => {
  const rect = confirm.getBoundingClientRect();
  return clamp((x - rect.left - KNOB / 2) / (rect.width - KNOB), 0, 1);
};
confirm.addEventListener('pointerdown', (e) => {
  if (confirmed) return;
  confirmPointer = e.pointerId;
  confirm.setPointerCapture?.(e.pointerId);
  confirmSteps = 0;
  confirmTick('light', { x: e.clientX, y: e.clientY });
});
confirm.addEventListener('pointermove', (e) => {
  if (confirmPointer !== e.pointerId || confirmed) return;
  const at = { x: e.clientX, y: e.clientY };
  const progress = confirmProgress(e.clientX);
  renderConfirm(progress);
  const steps = Math.floor((progress * travel()) / STEP_PX);
  if (steps > confirmSteps) {
    confirmSteps = steps;
    confirmTick('tick', at);
  }
  if (progress >= 0.97) {
    confirmed = true;
    confirmTick('burst', at);
    confirm.classList.add('done');
    label.textContent = 'Confirmed';
    renderConfirm(1, true);
  }
});
const confirmEnd = (e: PointerEvent) => {
  if (confirmPointer !== e.pointerId) return;
  confirmPointer = null;
  if (!confirmed) return renderConfirm(0, true);
  window.setTimeout(() => {
    confirmed = false;
    confirm.classList.remove('done');
    label.textContent = 'Slide to confirm';
    renderConfirm(0, true);
  }, 1500);
};
confirm.addEventListener('pointerup', confirmEnd);
confirm.addEventListener('pointercancel', confirmEnd);
renderConfirm(0);
addEventListener('resize', () => renderConfirm(confirmed ? 1 : 0));

// ---- QR: dot-matrix code for this page (the dev server swaps localhost for
// the computer's network address, so a phone can actually open it)
async function renderQr() {
  let url = location.href.split('#')[0];
  // Only the local dev server (plain http) knows the network address.
  if (location.protocol === 'http:') try {
    const lan = await fetch('lan.json', { cache: 'no-store' });
    if (lan.ok) url = (await lan.json()).url ?? url;
  } catch {
    /* static hosting: the page's own address is the one to share */
  }
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const finder = (r: number, c: number) => (c < 7 && (r < 7 || r >= n - 7)) || (r < 7 && c >= n - 7);
  let dots = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c) && !finder(r, c)) dots += `<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.38"/>`;
    }
  }
  const eye = (x: number, y: number) =>
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.8" fill="none" stroke="#f5f5f6" stroke-width="1"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="#8dffaa"/>`;
  $('qr').innerHTML =
    `<svg viewBox="0 0 ${n} ${n}" role="img" aria-label="QR code"><g fill="#d4d4d8">${dots}</g>` +
    `${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}</svg>`;
}
if (matchMedia('(hover: hover)').matches) void renderQr();
