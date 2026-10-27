import {
  attachDrag,
  attachTap,
  hapticEngine,
  isMuted,
  preventSwipeBack,
  setMuted,
  vibrate,
  type Haptic,
  type HapticPreset,
} from '../src/index';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// `?debug` shows the hidden switches, to see what takes each touch.
const debug = new URLSearchParams(location.search).has('debug');

// ---- Header
const engine = hapticEngine();
$('engine').textContent = engine;
const ios = navigator.userAgent.match(/OS (\d+[_\d]*) like Mac/)?.[1]?.replace(/_/g, '.');
$('platform').textContent = ios ? `iOS ${ios}` : /Android/.test(navigator.userAgent) ? 'Android' : 'Desktop';
$('engine-note').textContent = {
  switch: 'iPhone: every tap and drag here ticks through a hidden native switch under your finger.',
  vibrate: 'Android: every haptic here is a navigator.vibrate pattern.',
  none: 'This device has no haptics. Open this page on a phone to feel it.',
}[engine];

const mute = $<HTMLButtonElement>('mute');
const renderMute = () => (mute.textContent = isMuted() ? 'Haptics off' : 'Haptics on');
renderMute();
attachTap(mute, { haptic: 'selection', debug });
mute.addEventListener('click', () => {
  setMuted(!isMuted());
  renderMute();
});

// ---- Buttons
const taps = $('taps');
document.querySelectorAll<HTMLButtonElement>('#presets [data-haptic]').forEach((button) => {
  const haptic = button.dataset.haptic as HapticPreset;
  attachTap(button, { haptic, debug });
  button.addEventListener('click', () => (taps.innerHTML = `Played <strong>${haptic}</strong>`));
});

// A result that arrives later, with no touch to tick on: Android can still
// vibrate, iPhone only felt the tap.
const order = $<HTMLButtonElement>('order');
attachTap(order, { haptic: 'medium', debug });
order.addEventListener('click', () => {
  if (order.getAttribute('aria-busy') === 'true') return;
  order.setAttribute('aria-busy', 'true');
  order.textContent = 'Placing…';
  taps.textContent = 'Waiting on the server…';
  window.setTimeout(() => {
    vibrate('success');
    order.removeAttribute('aria-busy');
    order.textContent = 'Place order';
    taps.innerHTML = `<strong>Order placed.</strong> Android buzzed <strong>success</strong> just now.`;
  }, 900);
});

// ---- Chip groups (settings for the drag pad)
function chipGroup(name: string, onPick: (value: string) => void) {
  const chips = document.querySelectorAll<HTMLButtonElement>(`[data-group="${name}"] button`);
  chips.forEach((chip) => {
    attachTap(chip, { haptic: 'selection', debug });
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.toggle('on', c === chip));
      onPick(chip.dataset.value!);
    });
  });
}

// ---- Drag ticks
let spacing = 10;
let padHaptic: Haptic = 'tick';
chipGroup('spacing', (value) => (spacing = Number(value)));
chipGroup('haptic', (value) => (padHaptic = value as HapticPreset));

const pad = $('pad');
const padDrag = attachDrag(pad, { debug });
let padPointer: number | null = null;
let padLast = { x: 0, y: 0 };
let padTravel = 0;
let padSteps = 0;
pad.addEventListener('pointerdown', (e) => {
  padPointer = e.pointerId;
  padLast = { x: e.clientX, y: e.clientY };
  padTravel = padSteps = 0;
  $('pad-count').textContent = '0';
  padDrag.tick('light');
});
pad.addEventListener('pointermove', (e) => {
  if (padPointer !== e.pointerId) return;
  padTravel += Math.hypot(e.clientX - padLast.x, e.clientY - padLast.y);
  padLast = { x: e.clientX, y: e.clientY };
  const steps = Math.floor(padTravel / spacing);
  if (steps === padSteps) return;
  padSteps = steps;
  $('pad-count').textContent = String(steps);
  padDrag.tick(padHaptic);
});
const padEnd = (e: PointerEvent) => {
  if (padPointer === e.pointerId) padPointer = null;
};
pad.addEventListener('pointerup', padEnd);
pad.addEventListener('pointercancel', padEnd);

// ---- Slider: one tick per ruler mark
const MARKS = 20;
const ruler = $('ruler');
for (let i = 0; i <= MARKS; i += 1) {
  const mark = document.createElement('i');
  mark.style.left = `${(i / MARKS) * 100}%`;
  if (i === MARKS / 2) mark.className = 'mid';
  else if (i % 5 === 0) mark.className = 'major';
  ruler.appendChild(mark);
}

/** The haptic for moving from mark `from` to mark `to`: a triple at either
 *  end, a double crossing the centre, a tick for every other mark. */
function markHaptic(from: number, to: number): Haptic | null {
  if (from === to) return null;
  const crossed = (mark: number) => (to > from ? mark > from && mark <= to : mark < from && mark >= to);
  if (crossed(0) || crossed(MARKS)) return 'error';
  if (crossed(MARKS / 2)) return 'heavy';
  return 'tick';
}

const slider = $('slider');
const thumb = $('thumb');
const sliderDrag = attachDrag(slider, { debug });
let sliderPointer: number | null = null;
let sliderMark = MARKS / 2;
const renderSlider = (fraction: number) => {
  thumb.style.left = `calc(22px + (100% - 44px) * ${fraction})`;
  $('slider-value').textContent = String(Math.round(fraction * MARKS) - MARKS / 2);
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
  sliderDrag.tick('selection');
});
slider.addEventListener('pointermove', (e) => {
  if (sliderPointer !== e.pointerId) return;
  const fraction = sliderFraction(e.clientX);
  const mark = Math.round(fraction * MARKS);
  const haptic = markHaptic(sliderMark, mark);
  sliderMark = mark;
  renderSlider(fraction);
  if (haptic) sliderDrag.tick(haptic);
});
const sliderEnd = (e: PointerEvent) => {
  if (sliderPointer === e.pointerId) sliderPointer = null;
};
slider.addEventListener('pointerup', sliderEnd);
slider.addEventListener('pointercancel', sliderEnd);

// ---- Carousel: tick per card, bump past the ends, tap to open
const carousel = $('carousel');
const track = $('track');
const CARDS = 8;
const PITCH = 132;
for (let i = 0; i < CARDS; i += 1) {
  const card = document.createElement('div');
  card.textContent = `Card ${i + 1}`;
  card.style.setProperty('--h', String((i * 47) % 360));
  track.appendChild(card);
}
const maxOffset = -(CARDS - 1) * PITCH;
const carouselDrag = attachDrag(carousel, { debug });
let carouselPointer: number | null = null;
let startX = 0;
let startOffset = 0;
let offset = 0;
let index = 0;
let atEnd = false;
const setOffset = (value: number, animate = false) => {
  offset = value;
  track.style.transition = animate ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  track.style.transform = `translateX(${value}px)`;
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
  const raw = startOffset + (e.clientX - startX);
  const over = raw > 0 ? raw : raw < maxOffset ? raw - maxOffset : 0;
  if (over !== 0 && !atEnd) {
    atEnd = true;
    carouselDrag.tick('heavy');
  } else if (over === 0) {
    atEnd = false;
  }
  setOffset(raw - over * 0.7);
  const next = Math.round(-clamp(offset, maxOffset, 0) / PITCH);
  if (next !== index) {
    index = next;
    carouselDrag.tick('tick');
    $('carousel-out').textContent = `Card ${index + 1}`;
  }
});
const carouselEnd = (e: PointerEvent) => {
  if (carouselPointer !== e.pointerId) return;
  carouselPointer = null;
  if (Math.abs(e.clientX - startX) < 8) {
    setOffset(startOffset);
    const card = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el) => el.parentElement === track);
    if (card) openSheet(card.textContent ?? '');
    return;
  }
  index = Math.round(-clamp(offset, maxOffset, 0) / PITCH);
  setOffset(-index * PITCH, true);
  $('carousel-out').textContent = `Card ${index + 1}`;
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
  option.addEventListener('click', () => {
    sheet.hidden = true;
    $('carousel-out').textContent = `${option.dataset.choice}: ${$('sheet-title').textContent}`;
  });
});
$('sheet-backdrop').addEventListener('click', () => (sheet.hidden = true));

// ---- Scrolling chips
const chips = $('chips');
const chipNames = ['All', 'Music', 'Sports', 'Gaming', 'Food', 'Travel', 'Tech', 'Art', 'Film', 'Books'];
chipNames.forEach((name, i) => {
  const chip = document.createElement('button');
  chip.textContent = name;
  if (i === 0) chip.className = 'on';
  attachTap(chip, { haptic: 'selection', debug });
  chip.addEventListener('click', () => {
    chips.querySelectorAll('button').forEach((c) => c.classList.toggle('on', c === chip));
    $('chips-out').textContent = `Selected: ${name}`;
  });
  chips.appendChild(chip);
});

// ---- Swipe to confirm: dense ticks while it fills, a burst when it lands
const confirm = $('confirm');
const fill = $('confirm-fill');
const knob = $('confirm-knob');
const label = $('confirm-label');
const confirmDrag = attachDrag(confirm, { debug });
preventSwipeBack(confirm);
const STEP_PX = 12;
let confirmPointer: number | null = null;
let confirmSteps = 0;
let confirmed = false;
const renderConfirm = (progress: number, animate = false) => {
  const travel = confirm.clientWidth - 72;
  const ease = animate ? 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
  knob.style.transition = fill.style.transition = ease;
  knob.style.transform = `translateX(${progress * travel}px)`;
  fill.style.width = `${12 + 24 + progress * travel}px`;
};
const confirmProgress = (x: number) => {
  const rect = confirm.getBoundingClientRect();
  return clamp((x - rect.left - 36) / (rect.width - 72), 0, 1);
};
confirm.addEventListener('pointerdown', (e) => {
  if (confirmed) return;
  confirmPointer = e.pointerId;
  confirm.setPointerCapture?.(e.pointerId);
  confirmSteps = 0;
  confirmDrag.tick('light');
});
confirm.addEventListener('pointermove', (e) => {
  if (confirmPointer !== e.pointerId || confirmed) return;
  const progress = confirmProgress(e.clientX);
  renderConfirm(progress);
  const steps = Math.floor((progress * (confirm.clientWidth - 72)) / STEP_PX);
  if (steps > confirmSteps) {
    confirmSteps = steps;
    confirmDrag.tick('tick');
  }
  if (progress >= 0.96) {
    confirmed = true;
    confirmDrag.tick('burst');
    label.textContent = 'Confirmed ✓';
    renderConfirm(1, true);
  }
});
const confirmEnd = (e: PointerEvent) => {
  if (confirmPointer !== e.pointerId) return;
  confirmPointer = null;
  if (!confirmed) {
    renderConfirm(0, true);
    return;
  }
  window.setTimeout(() => {
    confirmed = false;
    label.textContent = 'Slide to confirm';
    renderConfirm(0, true);
  }, 1400);
};
confirm.addEventListener('pointerup', confirmEnd);
confirm.addEventListener('pointercancel', confirmEnd);
renderConfirm(0);
