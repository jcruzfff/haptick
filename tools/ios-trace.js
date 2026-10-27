// haptick iOS trace: records what every touch did to haptick's switches.
// On the Mac, open Safari > Develop > [your iPhone] > [your page], paste this
// into the console, then use the page on the phone. After a haptic you
// expected doesn't play, run  __hapticsReport()  to print the last gestures
// (and copy them to the clipboard).
(() => {
  const ARM_MS = 260; // when haptick starts asking iOS for drag ticks
  const describe = (el) => {
    if (!(el instanceof Element)) return String(el);
    const sw = el.matches('[data-haptick]');
    const host = sw ? el.parentElement : el;
    const label = (host?.getAttribute('aria-label') || host?.textContent || '').trim().slice(0, 24);
    const cls = (host?.className?.baseVal ?? host?.className ?? '').toString().split(' ')[0].slice(0, 28);
    return `${sw ? 'SWITCH in ' : ''}${host?.tagName.toLowerCase()}.${cls} "${label}"`;
  };
  const log = [];
  const push = (line) => {
    log.push(line);
    if (log.length > 60) log.shift();
  };
  let gesture = null;
  let count = 0;

  // Every time a haptic switch is moved, a drag tick was triggered (or it was
  // parked out of reach). Record when, relative to touchdown.
  const watched = new WeakSet();
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target.style.transform;
      if (gesture) gesture.moves.push(`${Math.round(performance.now() - gesture.start)}ms:${t ? (t.includes('-') ? 'L' : 'R') : 'reset'}`);
    }
  });
  const watchSwitches = () => {
    for (const input of document.querySelectorAll('[data-haptick]')) {
      if (watched.has(input)) continue;
      watched.add(input);
      observer.observe(input, { attributes: true, attributeFilter: ['style'] });
    }
  };
  setInterval(watchSwitches, 500);
  watchSwitches();

  window.addEventListener(
    'touchstart',
    (e) => {
      const touch = e.changedTouches[0];
      gesture = {
        n: ++count,
        start: performance.now(),
        target: describe(e.target),
        x: touch?.clientX ?? 0,
        y: touch?.clientY ?? 0,
        distance: 0,
        armedDistance: 0,
        moves: [],
        lastX: touch?.clientX ?? 0,
        lastY: touch?.clientY ?? 0,
        cancelledStart: false,
      };
      const g = gesture;
      setTimeout(() => (g.cancelledStart = e.defaultPrevented), 0);
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      const touch = e.changedTouches[0];
      if (!gesture || !touch) return;
      const step = Math.hypot(touch.clientX - gesture.lastX, touch.clientY - gesture.lastY);
      gesture.distance += step;
      if (performance.now() - gesture.start >= ARM_MS) gesture.armedDistance += step;
      gesture.lastX = touch.clientX;
      gesture.lastY = touch.clientY;
      if (e.defaultPrevented) gesture.cancelledMove = true;
    },
    { capture: true, passive: true },
  );
  const finish = (type) => () => {
    const g = gesture;
    if (!g) return;
    gesture = null;
    setTimeout(() => {
      const ms = Math.round(performance.now() - g.start);
      const ticks = g.moves.filter((m) => !m.endsWith('reset')).length;
      push(
        `#${g.n} ${type} ${ms}ms on ${g.target}\n` +
          `    start x=${Math.round(g.x)} · moved ${Math.round(g.distance)}px (${Math.round(g.armedDistance)}px after ${ARM_MS}ms)` +
          `${g.cancelledStart ? ' · START CANCELLED' : ''}${g.cancelledMove ? ' · MOVE CANCELLED' : ''}\n` +
          `    switch moves (${ticks}): ${g.moves.join(' ') || 'none'}`,
      );
    }, 50);
  };
  window.addEventListener('touchend', finish('tap/swipe'), { capture: true, passive: true });
  window.addEventListener('touchcancel', finish('CANCELLED'), { capture: true, passive: true });

  window.__hapticsReport = () => {
    const report = [
      `UA: ${navigator.userAgent}`,
      `switchAttr=${'switch' in HTMLInputElement.prototype} muted=${localStorage.getItem('haptick:muted')} url=${location.pathname}`,
      `--- last gestures (newest last) ---`,
      ...log,
    ].join('\n');
    console.log(report);
    try {
      copy(report);
      console.log('(report copied to clipboard)');
    } catch {}
    return 'done';
  };
  console.log('Haptics debugger v2 on. Use the app; after a failure run __hapticsReport()');
})();
