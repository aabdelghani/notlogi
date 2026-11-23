// Action ring overlay: eight round buttons around the pointer, each with its label outside it
// and a small close button in the middle. Hover picks one, click or 1-8 runs it, Esc, the middle
// or a click outside closes. Held on a button that steers it (raw mode), the pointer is hidden
// and frozen and the mouse picks by direction: a nudge past DEAD chooses the button that way,
// the highlight is the only indicator, and letting go runs it.
// A folder slot keeps the ring in view and fans its actions out on a bigger circle beside it, the
// first in the folder's own direction, the next a little to one side then the other (the middle,
// the folder again, or Esc closes it). The wheel over an adjustable slot (volume, brightness,
// zoom, tracks) steps it without closing the ring.
import * as G from './ring-geometry.js';
import { t } from '../shared/i18n.mjs';
(() => {
  const N = G.N;
  const BASE = { RW: 560, RH: 460, RR: 104, B: 28, NEAR: 38, FAR: 250 };
  let RW = BASE.RW, RH = BASE.RH;      // the ring's own extent; the window is the whole screen
  let CX = RW / 2, CY = RH / 2;       // where the ring is centred, set per show
  let RR = BASE.RR, B = BASE.B;       // ring radius to the bubble centres, bubble radius (scaled by the ring size)
  let NEAR = BASE.NEAR, FAR = BASE.FAR;   // pointer mode: inside NEAR is the middle button, beyond FAR is outside
  let LIFT = 20;                      // how far above the pointer the ring's middle sits (scaled with the ring)
  const GAIN = 1;
  let DEAD = 30, LIMIT = 60;       // travel before a button is chosen, and where the point saturates (set per show)
  const slotsEl = document.getElementById('slots'), hub = document.getElementById('hub'), note = document.getElementById('note');
  hub.style.display = 'none';   // nothing on screen until the first opening places the ring
  let slots = [], root = [], stack = [], hover = -1, shownAt = 0, last = null, raw = false, vx = 0, vy = 0;
  let size = { w: RW, h: RH }, waiting = false, guess = null, openedAt = 0, told = false, keepOn = true;   // keepOn: the ring stays fully on screen
  const pad = list => Array.from({ length: N }, (_, i) => (list || [])[i] || null);
  const keyOf = a => typeof a === 'string' ? a : a && a.preset;
  const isFolder = i => i >= 0 && slots[i] && slots[i].action && slots[i].action.type === 'folder';
  const where = i => stack.length ? stack.concat(i) : i;   // a slot's place, inside folders too
  // the Volume slot: pressed and held, dragging right or left sets the level (shown next to its icon,
  // out of 100); letting go of the click keeps the level and closes the ring. The wheel over any
  // volume slot sets it too, and the ring stays open.
  const PX_PER_STEP = 3;            // pointer travel for one percent
  const VOLUME = new Set(['volume_dial', 'volume_up', 'volume_down']);
  const ADJUST = new Set(['brightness_up', 'brightness_down', 'zoom_in', 'zoom_out', 'next_track', 'prev_track']);
  let dial = null;                  // { i, kind, level, lastX, ready, wheel, name }
  // the slots that set a level by dragging: Volume and screen Brightness
  const dialKind = sl => !sl ? null : sl.action === 'volume_dial' ? 'volume' : sl.action && sl.action.type === 'brightness_dial' ? 'brightness' : null;
  const isDial = i => i >= 0 && !!dialKind(slots[i]);
  const DIAL_IO = { volume: { get: () => window.ring.volGet(), set: v => window.ring.volSet(v) }, brightness: { get: () => window.ring.briGet(), set: v => window.ring.briSet(v) } };
  // pressed and dragged: the rest of the ring steps aside and a volume bar alone follows the level
  const volEl = document.getElementById('vol');
  const volIcon = (l, kind) => 'fa-solid ' + (kind === 'brightness' ? (l < 30 ? 'fa-moon' : 'fa-sun') : l === 0 ? 'fa-volume-xmark' : l < 40 ? 'fa-volume-low' : 'fa-volume-high');
  // a screen whose brightness cannot be read or set says so instead of a level
  const dialOff = () => dial && dial.ready && dial.level === null;
  const DIAL_WHY = {
    ddcutil: () => t('Set up monitor brightness in NotLogi first'), i2c: () => t('Set up monitor brightness in NotLogi first'),
    none: name => t('{name} cannot be changed from here', { name }), ddc: name => t('{name} did not answer', { name }),
    platform: name => t('{name} not available on this system yet', { name }),
  };
  const offText = () => (DIAL_WHY[dial.reason] || DIAL_WHY.none)(dial.name || t('This screen'));
  function dialShow() {
    if (!dial) return;
    if (!dial.wheel) {
      volEl.style.left = CX + 'px'; volEl.style.top = CY + 'px';
      volEl.innerHTML = dialOff() ? `<i class="${volIcon(50, dial.kind)}"></i><span class="vol-na">${esc(offText())}</span>`
        : !dial.ready ? `<i class="${volIcon(50, dial.kind)}"></i><span class="vol-n">…</span>`
        : `<i class="${volIcon(dial.level, dial.kind)}"></i><span class="vol-n">${dial.level}</span><span class="vol-of">/100</span>${dial.name ? `<span class="vol-name">${esc(dial.name)}</span>` : ''}<span class="vol-bar"><span style="width:${dial.level}%"></span></span>`;
      return;
    }
    const lab = slotsEl.querySelector(`.lab[data-i="${dial.i}"]`), bub = slotsEl.querySelector(`.bub[data-i="${dial.i}"]`);
    if (lab) { lab.classList.add('on', 'dial'); lab.innerHTML = dialOff() ? `<span class="vol-of">${esc(offText())}</span>` : `<span class="vol-n">${dial.level}</span><span class="vol-of">/100</span><span class="vol-bar"><span style="width:${dial.level}%"></span></span>`; }
    if (bub) { bub.classList.add('dialing'); const ic = bub.querySelector('i'); if (ic) ic.className = volIcon(dialOff() ? 50 : dial.level, dial.kind); }
  }
  async function dialStart(i, x, wheel) {
    if (dial && dial.i === i) return;
    const kind = dialKind(slots[i]) || 'volume';   // Volume up and down turn with the wheel like the Volume dial
    dial = { i, kind, level: 50, lastX: x, tick: 0, ready: false, wheel: !!wheel };
    if (!wheel) { document.body.classList.add('vol-focus'); dialShow(); }
    try { const v = await DIAL_IO[kind].get(); if (dial && dial.i === i) { dial.level = v.level; dial.name = v.name; dial.reason = v.reason; dial.ready = true; } } catch (e) { if (dial) { dial.level = kind === 'volume' ? 50 : null; dial.ready = true; } }
    dialShow();
  }
  function dialMove(dx) {
    if (!dial || !dial.ready || dial.level === null) return;
    dial.acc = (dial.acc || 0) + dx / PX_PER_STEP;            // right raises the volume, left lowers it
    const step = Math.trunc(dial.acc); if (!step) return;
    dial.acc -= step;
    const before = dial.level;
    dial.level = Math.max(0, Math.min(100, dial.level + step));
    if (dial.level === before) return;
    DIAL_IO[dial.kind].set(dial.level);
    if (Math.floor(dial.level / 5) !== Math.floor(before / 5)) window.ring.hover(dial.i);   // a tick every 5% on mice that can
    dialShow();
  }
  // a wheel-set volume ends when the pointer leaves that slot: the slot shows its name again
  function dialEnd() { if (!dial) return; dial = null; document.body.classList.remove('vol-focus'); build(true); }
  // Wayland: the compositor may still move or resize the full-screen window just after it appears,
  // which shifts a ring drawn in window coordinates away from the pointer. For a short while after
  // opening, the ring follows the pointer it sees; each correction goes into the problem report.
  const SETTLE_MS = 350;
  let settleUntil = 0, settled = 0;
  const EARLY_MS = 30, JUMP_PX = 160;
  let doubt = null;   // the first position, when it came too soon to be a movement
  // how this opening found the pointer, for the problem report
  const tell = (how, x, y) => { if (told) return; told = true; window.ring.diag({ how, ms: Math.round(performance.now() - openedAt), x: Math.round(x), y: Math.round(y), guess }); };
  // centre the ring on a point, kept fully on screen
  function centreAt(x, y, again) {
    // centred on the pointer itself unless kept on screen; a little above it, so the pointer sits in
    // the lower part of the middle button rather than covering it
    if (keepOn) { CX = Math.max(RW / 2, Math.min(size.w - RW / 2, x)); CY = Math.max(RH / 2, Math.min(size.h - RH / 2, y)); } else { CX = x; CY = y - LIFT; }
    waiting = false;
    hub.style.left = CX + 'px'; hub.style.top = CY + 'px'; hub.style.display = '';
    note.style.left = CX + 'px'; note.style.top = (CY - NEAR - 14) + 'px';
    slotsEl.classList.toggle('moved', !!again);   // a correction moves the ring without springing it out again
    build();
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ang = G.ang;    // slot 0 at the top, clockwise
  // a folder's actions: an ordered row on a second circle around the same middle as the ring, twice
  // its radius and spaced like the ring's own buttons, centred on the folder's direction
  let fanOrder = [], fanN = 0;
  function fanLayout() { ({ order: fanOrder, n: fanN } = G.fanOrder(slots)); }
  const FAN_R = G.FAN_R;   // the folder's circle, its actions 20° apart: a little closer than on the ring
  const fanAng = i => G.fanAngle(stack[0], fanOrder[i] ?? 0, fanN);
  // where a button of the level shown sits: on the ring, or on the outer circle of the open folder
  const posOf = i => {
    const a = stack.length ? fanAng(i) : ang(i), r = stack.length ? RR * FAN_R : RR;
    return { a, r, cx: CX, cy: CY, x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  };
  function setRaw(on) { raw = on; document.body.classList.toggle('raw', on); if (!on) { vx = vy = 0; } }
  function build(still) {
    slotsEl.classList.toggle('moved', !!still);
    hubIcon();
    let html = '';
    if (stack.length) {
      // the ring the folder belongs to stays in view, dimmed, the open folder lit
      const f = stack[0];
      html += root.map((s, i) => {
        if (!s) return '';
        const c = Math.cos(ang(i)), sn = Math.sin(ang(i)), folder = s.action && s.action.type === 'folder';
        return `<div class="bub parent ${i === f ? 'open' : ''} ${folder ? 'folder' : ''}" data-p="${i}" style="left:${(CX + RR * c).toFixed(1)}px;top:${(CY + RR * sn).toFixed(1)}px;--a:${i * 45 - 90}deg;--i:0;--dx:0px;--dy:0px"><i class="fa-solid ${esc(s.icon || (folder ? 'fa-folder' : 'fa-circle-dot'))}"></i></div>`;
      }).join('');
    }
    const fx = stack.length ? CX + RR * Math.cos(ang(stack[0])) : CX, fy = stack.length ? CY + RR * Math.sin(ang(stack[0])) : CY;
    html += slots.map((s, i) => {
      if (!s) return '';   // an empty slot is not drawn at all
      const { a, r, cx: ox, cy: oy, x: bx, y: by } = posOf(i), c = Math.cos(a), sn = Math.sin(a);
      const folder = s.action && s.action.type === 'folder';
      // each button springs out from the middle, one after another; in a folder each one pops up in its
      // place, the middle of the row first
      const fan = stack.length, sx = fan ? CX + RR * c : fx, sy = fan ? CY + RR * sn : fy;
      const order = fan ? Math.abs((fanOrder[i] ?? 0) - (fanN - 1) / 2) : i;
      const bub = `<div class="bub ${folder ? 'folder' : ''} ${fan ? 'fan' : ''}" data-i="${i}" style="left:${bx.toFixed(1)}px;top:${by.toFixed(1)}px;--a:${(a * 180 / Math.PI).toFixed(1)}deg;--i:${order};--dx:${(sx - bx).toFixed(0)}px;--dy:${(sy - by).toFixed(0)}px"><i class="fa-solid ${esc(s.icon || (folder ? 'fa-folder' : 'fa-circle-dot'))}"></i></div>`;
      // the label sits outside the bubble, growing away from the ring
      const lx = ox + (r + B + 16) * c, ly = oy + (r + B + 16) * sn;
      const tx = c > 0.3 ? '0' : c < -0.3 ? '-100%' : '-50%', ty = sn > 0.3 ? '0' : sn < -0.3 ? '-100%' : '-50%';
      return bub + `<div class="lab" data-i="${i}" style="left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:translate(${tx},${ty})">${esc(t(s.label))}${folder ? ' <i class="fa-solid fa-chevron-right lab-more"></i>' : ''}</div>`;   // i18n: data
    }).join('');
    slotsEl.innerHTML = html;
    setHover(-1);
  }
  function setHover(i) {
    if (i !== hover && i >= 0 && slots[i]) window.ring.hover(i);   // the mouse may answer with a tick
    hover = i;
    slotsEl.querySelectorAll('.bub, .lab').forEach(w => w.classList.toggle('on', Number(w.dataset.i) === i));
  }
  // the middle: close on the top ring, back out of an open folder
  function hubIcon() { hub.querySelector('i').className = 'fa-solid ' + (stack.length ? 'fa-arrow-left' : 'fa-xmark'); }
  // a folder: its actions fan out beside it on the outer circle; the ring stays where it is
  function enter(i) {
    dwellOff();
    stack = [i]; slots = pad(slots[i].action.slots); fanLayout(); dial = null; vx = vy = 0;
    build(); hub.classList.remove('on');
  }
  function up() {
    dwellOff();
    stack = []; slots = root; dial = null; vx = vy = 0;
    build(true); hub.classList.remove('on');
  }
  // hovering a folder opens it after a moment; resting on the middle closes it again
  let dwell = null;
  function dwellOn(kind, i) {
    if (dwell && dwell.kind === kind && dwell.i === i) return;
    dwellOff();
    dwell = { kind, i, t: setTimeout(() => { const d = dwell; dwell = null; if (!d) return; if (d.kind === 'open' && !stack.length && isFolder(d.i)) enter(d.i); if (d.kind === 'close' && stack.length) up(); }, kind === 'open' ? 160 : 260) };
  }
  function dwellOff() { if (dwell) { clearTimeout(dwell.t); dwell = null; } }
  // run what is chosen, or open it when it is a folder
  function choose(i) {
    if (i < 0 || !slots[i]) return;
    if (isFolder(i)) { enter(i); return; }
    window.ring.pick(where(i));
  }
  function flash(i) { const lab = slotsEl.querySelector(`.lab[data-i="${i}"]`); if (!lab) return; lab.classList.remove('pulse'); void lab.offsetWidth; lab.classList.add('pulse'); }
  const wedge = G.wedge;
  // pointer mode: which button is meant by (x, y); -1 on the middle button or outside
  function at(x, y) {
    const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
    if (d < NEAR) return -1;
    if (stack.length) {
      return G.nearest(slots.map((s, i) => s ? posOf(i) : null), x, y, B * 1.7);
    }
    if (d > FAR) return -1;
    return wedge(dx, dy);
  }
  // in a folder: a button of the ring under the pointer (another one closes the fan and is chosen)
  function parentAt(x, y) {
    if (!stack.length) return -1;
    return G.nearest(root.map((s, i) => s ? { x: CX + RR * Math.cos(ang(i)), y: CY + RR * Math.sin(ang(i)) } : null), x, y, B * 1.3);
  }
  // steering in a folder: the fan button whose direction is closest, within half a step of it
  function fanToward(dx, dy) {
    return G.closestByAngle(Math.atan2(dy, dx), slots.map((s, i) => s ? fanAng(i) : null));
  }
  document.addEventListener('mousemove', e => {
    if (waiting) {   // first sight of the pointer: the ring goes there
      // A position that comes with the window itself (within EARLY_MS) may be a remembered one: through
      // XWayland a program hears of the pointer only over X11 windows, and is handed the last place
      // it was seen there (KDE on Wayland: the ring opened where the last click in an X11 window was).
      doubt = performance.now() - openedAt < EARLY_MS ? [e.clientX, e.clientY] : null;
      tell('pointer event', e.clientX, e.clientY); centreAt(e.clientX, e.clientY); settleUntil = performance.now() + SETTLE_MS; settled = 0; return;
    }
    // the movement after a doubted position: a pointer does not jump, so one that is far from it is
    // the first true word of where the pointer is, and the ring goes there
    if (doubt) {
      const far = Math.hypot(e.clientX - doubt[0], e.clientY - doubt[1]) > JUMP_PX;
      doubt = null;
      if (far && hover < 0 && !stack.length) {
        window.ring.diag({ how: 'moved from a remembered position', ms: Math.round(performance.now() - openedAt), x: Math.round(e.clientX), y: Math.round(e.clientY) });
        centreAt(e.clientX, e.clientY, true); settleUntil = performance.now() + SETTLE_MS; settled = 0;
        return;
      }
    }
    if (raw) return;
    if (dial && !dial.wheel) { dialMove(e.clientX - dial.lastX); dial.lastX = e.clientX; return; }   // pressed on the Volume slot: right and left set the level
    if (dial && dial.wheel && at(e.clientX, e.clientY) !== dial.i) dialEnd();
    if (performance.now() < settleUntil && hover < 0 && !stack.length) {
      const dx = e.clientX - CX, dy = e.clientY - CY;
      if (Math.hypot(dx, dy) > 1 && Math.hypot(dx, dy) < 160) {
        centreAt(e.clientX, e.clientY, true);
        if (settled++ < 3) window.ring.diag({ how: 're-centred', ms: Math.round(performance.now() - openedAt), x: Math.round(e.clientX), y: Math.round(e.clientY), dx: Math.round(dx), dy: Math.round(dy) });
        return;
      }
    }
    last = [e.clientX, e.clientY];
    const dc = Math.hypot(e.clientX - CX, e.clientY - CY);
    hub.classList.toggle('on', dc < NEAR);
    if (stack.length) {
      const p = parentAt(e.clientX, e.clientY);
      if (p >= 0 && p !== stack[0]) up();          // onto another ring button: the folder closes
      else if (dc < NEAR) dwellOn('close', -1);     // resting on the middle closes it too
      else if (dwell && dwell.kind === 'close') dwellOff();
    }
    const i = at(e.clientX, e.clientY); if (i !== hover) setHover(i);
    if (!stack.length) { if (isFolder(i)) dwellOn('open', i); else dwellOff(); }
  });
  // the wheel: sets a volume slot (shown out of 100), steps brightness, zoom or tracks
  document.addEventListener('wheel', async e => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    if (dial) { dialMove(dir * PX_PER_STEP * 2); return; }
    const i = hover; if (i < 0 || !slots[i]) return;
    const k = keyOf(slots[i].action);
    if (VOLUME.has(k) || isDial(i)) { await dialStart(i, 0, true); dialMove(dir * PX_PER_STEP * 2); return; }
    if (ADJUST.has(k)) { window.ring.adjust([].concat(where(i)), dir); flash(i); }
  }, { passive: false });
  document.addEventListener('mouseleave', () => { if (!raw) { setHover(-1); hub.classList.remove('on'); } });
  document.addEventListener('mousedown', e => {
    const di = raw ? hover : at(e.clientX, e.clientY);
    if (isDial(di)) { setHover(di); dialStart(di, e.clientX); return; }
    if (raw) { if (hover >= 0 && slots[hover]) choose(hover); else if (stack.length) up(); return; }   // a click while steering picks the highlighted button
    const i = at(e.clientX, e.clientY);
    if (i >= 0 && slots[i]) { choose(i); return; }
    // in a folder: the middle or the folder itself closes the fan; another ring button is chosen
    if (stack.length) {
      if (Math.hypot(e.clientX - CX, e.clientY - CY) < NEAR) { up(); return; }
      const p = parentAt(e.clientX, e.clientY);
      if (p === stack[0]) { up(); return; }
      if (p >= 0) { up(); choose(p); return; }
    }
    window.ring.close();
  });
  // letting go of the click keeps the level and brings the ring back
  document.addEventListener('mouseup', e => {
    if (!dial || dial.wheel) return;
    const i = dial.i; dialEnd();
    if (raw) setHover(i); else { const at0 = at(e.clientX, e.clientY); setHover(at0); last = [e.clientX, e.clientY]; }
  });
  // keys arrive from the main process (the window has no focus of its own)
  window.ring.onKey(({ key }) => {
    if (key === 'Escape') { if (stack.length) up(); else window.ring.close(); return; }
    const n = Number(key); if (n >= 1 && n <= N && slots[n - 1]) choose(n - 1);
  });
  // Next ring profile: the same ring, the next profile's actions, its name shown for a moment
  window.ring.onSlots(({ slots: next, name }) => {
    root = pad(next); stack = []; slots = root; dial = null; vx = vy = 0;
    build();
    if (name) { note.textContent = t(name); note.classList.remove('show'); void note.offsetWidth; note.classList.add('show'); }   // i18n: data
  });
  // about to be hidden: nothing left to show again when the window next opens
  window.ring.onClear(() => {
    dwellOff(); dial = null; stack = []; hover = -1; vx = vy = 0;
    slotsEl.innerHTML = ''; hub.style.display = 'none';
    note.classList.remove('show'); document.body.classList.remove('vol-focus');
  });
  window.ring.onShow(msg => {
    // dressed like the desktop it opens on: its light or dark, its accent colour, its font
    const look = msg.look || {}, rootEl = document.documentElement;
    rootEl.dataset.theme = look.dark ? 'dark' : 'light';
    if (look.accent) { rootEl.style.setProperty('--acc', look.accent); rootEl.style.setProperty('--acc-fg', look.accentFg || '#fff'); }
    if (look.font) document.body.style.fontFamily = `"${look.font}", system-ui, sans-serif`;
    // the ring's size: everything in it scales together
    const s = Math.max(0.6, Math.min(1.6, Number(msg.scale) || 1));
    rootEl.style.setProperty('--s', s);
    RW = BASE.RW * s; RH = BASE.RH * s; RR = BASE.RR * s; B = BASE.B * s; NEAR = BASE.NEAR * s; FAR = BASE.FAR * s; LIFT = 20 * s;
    root = pad(msg.slots); stack = []; slots = root; dwellOff();
    shownAt = Date.now(); last = null; vx = vy = 0; dial = null;
    DEAD = Math.max(5, Math.min(120, Number(msg.travel) || 30)); LIMIT = DEAD * 2;
    hub.classList.remove('on'); note.classList.remove('show'); document.body.classList.remove('vol-focus');
    setRaw(!!msg.raw);
    size = msg.size || { w: RW, h: RH }; guess = msg.guess || null; openedAt = performance.now(); told = false; keepOn = msg.keepOn !== false;
    settleUntil = 0;
    if (msg.at) { tell('known up front', msg.at.x, msg.at.y); centreAt(msg.at.x, msg.at.y); }
    else {
      // the pointer's place is not known here (Wayland): draw nothing until it is seen over the
      // window, and fall back to the best guess if it never moves
      waiting = true; doubt = null; slotsEl.innerHTML = ''; hub.style.display = 'none';
      setTimeout(() => { if (waiting) { const gx = guess ? guess.x : size.w / 2, gy = guess ? guess.y : size.h / 2; tell('fallback after 250 ms', gx, gy); centreAt(gx, gy); } }, 250);
    }
  });
  window.ring.onMove(({ dx, dy }) => {
    if (!raw) setRaw(true);
    if (dial && !dial.wheel) { dialMove(dx); return; }
    if (dial && dial.wheel) dialEnd();
    if (Date.now() - shownAt < G.JOLT_MS) return;   // the press's own jolt: it steers nothing
    vx += dx * GAIN; vy += dy * GAIN;
    const d = Math.hypot(vx, vy);
    if (d > LIMIT) { vx *= LIMIT / d; vy *= LIMIT / d; }   // never leaves the ring
    const i = Math.hypot(vx, vy) < DEAD ? -1 : stack.length ? fanToward(vx, vy) : wedge(vx, vy);
    hub.classList.toggle('on', i < 0);
    if (!stack.length) { if (isFolder(i)) dwellOn('open', i); else dwellOff(); }
    else if (Math.hypot(vx, vy) < DEAD) dwellOn('close', -1); else if (dwell && dwell.kind === 'close') dwellOff();
    if (i !== hover) setHover(i);
  });
  // the button that opened the ring was released: run what is chosen; a quick tap with nothing
  // chosen leaves the ring open for a click; letting go outside the ring dismisses it
  window.ring.onRelease(() => {
    if (dial) return;
    if (isDial(hover)) { if (raw) setRaw(false); return; }   // Volume is pressed, not picked by letting go: keep the ring open for it
    // a folder chosen by letting go opens, and stays open for the pointer to pick inside it
    if (isFolder(hover)) { enter(hover); setRaw(false); return; }
    const heldMs = Date.now() - shownAt;
    if (raw) {
      // a tap or a short press hands the ring to the pointer for a click, an aim runs, a long hold cancels
      const next = G.rawRelease({ heldMs, travel: Math.hypot(vx, vy), dead: DEAD, hasPick: hover >= 0 && !!slots[hover] });
      if (next === 'pick') choose(hover);
      else if (next === 'stay') { setRaw(false); setHover(-1); hub.classList.remove('on'); }
      else window.ring.close();
      return;
    }
    if (hover >= 0 && slots[hover]) { choose(hover); return; }
    const tap = heldMs < G.TAP_MS;
    if (tap || !last) return;
    if (Math.hypot(last[0] - CX, last[1] - CY) > FAR) window.ring.close();
  });
})();
