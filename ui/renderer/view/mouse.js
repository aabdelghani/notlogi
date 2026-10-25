// View: a mouse's pages: its photo with the buttons, gestures, haptics, point and scroll.
import { isNative } from '../../shared/profiles.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, SLOTS, assignment, backlightPanel, card, deviceProfiles, drawerUp, drop, esc, fmtOut, gestureCapable, gestureControl, gestureObject, isRingAction, overridden, presetLabel, range, ringStage, row, sec, sw, isGaming, macrosCard;
export function link(ctx) { ({ S, SLOTS, assignment, backlightPanel, card, deviceProfiles, drawerUp, drop, esc, fmtOut, gestureCapable, gestureControl, gestureObject, isRingAction, overridden, presetLabel, range, ringStage, row, sec, sw, isGaming, macrosCard } = ctx); }

// ----------------------------------------------------------- photos
// One photo per mouse model, keyed by device id like the keyboards. A spot is a control id (or
// 'thumb' for the thumb wheel) and where it is on the photo; its number is the row it has on the
// Buttons page, so the two always agree. A mouse without an entry shows the rows only.
const MOUSE_PHOTOS = (() => {
  const s3 = { src: '../assets/devices/b034.png', w: 1021, h: 1644, pt: [['wheel', 690, 300, 'r'], ['thumb', 520, 770, 'l'], ['pointer', 840, 800, 'r']], spots: [[82, 690, 300], [196, 815, 590], [86, 357, 707], ['thumb', 520, 770], [83, 450, 975], [195, 82, 954]] };
  const m4 = { src: '../assets/devices/b042.png', w: 1021, h: 1594, pt: [['wheel', 771, 303, 'r'], ['thumb', 577, 899, 'l'], ['pointer', 850, 840, 'r']], spots: [[82, 771, 303], [196, 822, 630], [195, 394, 575], [86, 434, 749], [83, 483, 956], ['thumb', 577, 899], [416, 310, 779]] };
  // MX Anywhere 3S: a side view (the side buttons show), drawn at the others' width so the rings match
  const a3 = { src: '../assets/devices/b037.png', w: 1021, h: 1708, pt: [['wheel', 715, 324, 'r'], ['pointer', 816, 768, 'r']], spots: [[82, 726, 274], [196, 767, 580], [86, 224, 701], [83, 286, 1025]] };
  // PRO X3 SUPERSTRIKE: a top view; the markers come from its own layout data, in its 1410x2800 space
  const x3 = { src: '../assets/devices/40be.png', w: 1410, h: 2800, pt: [['wheel', 705, 554, 'r'], ['pointer', 705, 1900, 'r']], spots: [[80, 328, 681], [81, 1060, 681], [82, 705, 400], [86, 15, 1088], [83, 35, 1508]] };   // the middle button's ring sits up the wheel so its name clears the right click's
  return { b034: s3, b035: s3, b043: s3, b042: m4, b048: m4, b037: a3, '40be': x3 };
})();
// the underside, for Easy-Switch: where the printed 1, 2 and 3 sit above the switch button
const MOUSE_BOTTOMS = (() => {
  const s3 = { src: '../assets/devices/b034-bottom.png', w: 692, h: 1024, hosts: [[0, 225, 672, 'l'], [1, 266, 650, 'r'], [2, 307, 672, 'r']] };
  // MX Master 4: its underside, the lit channel light put out (the page lights the current one)
  const m4 = { src: '../assets/devices/b042-bottom.png', w: 706, h: 1024, hosts: [[0, 236, 705, 'l'], [1, 277, 690, 'r'], [2, 319, 705, 'r']] };
  // MX Anywhere 3S: its underside, the lit channel light put out
  const a3 = { src: '../assets/devices/b037-bottom.png', w: 671, h: 1024, hosts: [[0, 281, 719, 'l'], [1, 334, 697, 'r'], [2, 389, 719, 'r']] };
  return { b034: s3, b035: s3, b043: s3, b042: m4, b037: a3 };
})();
// a gaming mouse names its buttons as G HUB does, the two clicks included
const G_PHYS = [[80, t('Primary click')], [81, t('Secondary click')], [82, t('Middle click')], [86, t('Forward')], [83, t('Back')]];
const buttonRows = d => (isGaming(d) ? G_PHYS : PHYS).filter(([cid]) => d.controls.some(c => c.cid === cid));
// The mouse photo: a ring on each button and its name beside it, on the side away from the mouse.
// A ring opens that button's panel (like a key on the keyboard); the one being edited is filled.
function mousePhoto(d, plain) {
  const P = MOUSE_PHOTOS[d.id];
  if (!P) return '';
  if (plain) return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/></svg>`;
  const order = buttonRows(d).map(([cid]) => cid);
  const editing = k => drawerUp() && String(S.picker.cid) === String(k);
  const shown = P.spots.filter(([k]) => k === 'thumb' ? d.controls.length : order.includes(k));
  // a gaming mouse shows (and edits) the G-Shift layer while it is switched to it
  const bsec = isGaming(d) && S.gshiftLayer ? 'buttons_gshift' : 'buttons';
  const spots = shown.map(([k, x, y]) => {
    const a = k === 'thumb' ? assignment(d, 'thumbwheel') : assignment(d, bsec, k);
    const nm = k === 'thumb' ? t('Thumb wheel') : (((isGaming(d) ? G_PHYS : PHYS).find(x => x[0] === k) || [])[1] || (d.controls.find(c => c.cid === k) || {}).label || t('Button'));
    return `<g class="hotspot ms ${editing(k) ? 'selected' : ''}" data-section="${k === 'thumb' ? 'thumbwheel' : bsec}" data-cid="${k}" data-name="${esc(nm)}" data-does="${esc(presetLabel(a))}" data-custom="${isNative(a) ? '' : '1'}"><circle class="ring" cx="${x}" cy="${y}" r="40"/></g>`;
  }).join('');
  // names sit in two columns just outside the photo, each joined to its ring by a thin line; on
  // each side they are spaced so none overlaps the one above
  const GAP = 150, place = {};
  for (const side of ['l', 'r']) {
    let prev = -Infinity;
    shown.filter(([, x]) => (x < P.w / 2) === (side === 'l')).sort((p, q) => p[2] - q[2]).forEach(([k, , y]) => { const ly = Math.max(y, prev + GAP); place[k] = ly; prev = ly; });
  }
  const lines = shown.map(([k, x, y]) => { const left = x < P.w / 2, ly = place[k]; return `<polyline class="ms-line ${editing(k) ? 'on' : ''}" points="${left ? x - 40 : x + 40},${y} ${left ? -20 : P.w + 20},${ly}"/>`; }).join('');
  const labels = shown.map(([k, x]) => {
    const a = k === 'thumb' ? assignment(d, 'thumbwheel') : assignment(d, bsec, k);
    const nm = k === 'thumb' ? t('Thumb wheel') : (((isGaming(d) ? G_PHYS : PHYS).find(x => x[0] === k) || [])[1] || (d.controls.find(c => c.cid === k) || {}).label || t('Button'));
    const left = x < P.w / 2;
    const ov = k === 'thumb' ? overridden(d, 'thumbwheel') : overridden(d, bsec, k);
    return `<div class="ms-lab ${left ? 'l' : 'r'} ${editing(k) ? 'on' : ''} ${isNative(a) ? '' : 'custom'} ${ov ? 'pv' : ''}" data-ring="${k}" style="top:${(place[k] / P.h * 100).toFixed(2)}%"><span class="k">${esc(nm)}</span><span class="d">${esc(presetLabel(a))}</span></div>`;
  }).join('');
  return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${spots}</svg>${labels}`;
}

// ----------------------------------------------------------- pages
const PHYS = [[82, t('Middle button')], [83, t('Back')], [86, t('Forward')], [195, t('Gesture button')], [196, t('Mode shift')], [416, t('Haptic panel')]];
function pageButtons(d) {
  const rows = buttonRows(d).map(([cid, label], i) => {
    const a = assignment(d, 'buttons', cid);
    return `<div class="row"><span class="num">${i + 1}</span><span class="grow lbl">${label}</span>${drop(a, `data-act="pick" data-section="buttons" data-cid="${cid}" data-label="${esc(label)}"`)}</div>`;
  }).join('');
  const tw = assignment(d, 'thumbwheel');
  const twInvert = !!((d.config.settings || {}).thumbwheel || {}).invert;
  const twGain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
  const twSpeed = Math.max(1, Math.min(10, Math.round(twGain / 1.6)));
  const twRow = d.controls.length ? `<div class="row"><span class="num">${buttonRows(d).length + 1}</span><span class="grow lbl">${t('Thumb wheel')}</span>${drop(tw, `data-act="pick" data-section="thumbwheel" data-cid="thumb" data-label="${esc(t('Thumb wheel'))}"`)}</div>` : '';
  const photo = mousePhoto(d);
  // a gaming mouse: the buttons' own layer, or what they do while a G-Shift button is held
  const layer = isGaming(d) ? `<div class="layer-bar"><span class="seg"><button class="${S.gshiftLayer ? '' : 'on'}" data-act="gshift-layer" data-key="default">${t('Default')}</button><button class="${S.gshiftLayer ? 'on' : ''}" data-act="gshift-layer" data-key="gshift">${t('G-Shift')}</button></span><span class="hint">${S.gshiftLayer ? t('While a button set to G-Shift is held, the others do this') : t('Give a button G-Shift (System) to use a second layer')}</span></div>` : '';
  if (photo) return `${layer}<div class="photo-card ms-photo ${isGaming(d) && S.gshiftLayer ? 'gshift' : ''}">${photo}</div>${isGaming(d) ? `<div class="macros-below">${macrosCard(d)}</div>` : ''}`;
  return `<div class="${photo ? 'photo-col' : ''}">${photo ? `<div class="photo-card">${photo}<div class="kb-tip" hidden></div></div>` : ''}
    <div style="display:flex;flex-direction:column;gap:18px">${sec(t('Buttons'), card(rows + twRow) + `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="reset-buttons"><i class="fa-solid fa-rotate-left"></i>${t('Restore defaults')}</button></div><div class="hint">${t('Left and right click cannot be reassigned. Overrides for the focused app are set in <a href="#" data-act="page" data-page="apps">Profiles</a>.')}</div>`)}${twRow ? sec(t('Thumb wheel'), card(
      row(t('Invert direction'), '', sw(twInvert, 'data-act="setting" data-path="thumbwheel.invert"')) +
      `<div class="row"><span class="grow lbl">${t('Speed')}</span>${range('data-act="thumb-speed" data-out="tws"', twSpeed, 1, 10, 1)}<span class="val" data-out="tws" style="width:24px;text-align:right">${twSpeed}</span></div>`)) : ''}</div></div>`;
}

function gestureStage(d, cid, g, sens) {
  const on = k => drawerUp() && S.picker.section === 'gesture' && S.dir === k;
  const cell = (k, icon) => { const sub = g[SLOTS[k][1]]; return `<button class="gs-cell ${k === 'tap' ? 'tap' : ''} ${on(k) ? 'on' : ''} ${isNative(sub) || !sub || (sub.type === 'nothing') ? 'empty' : ''}" data-act="dir-pick" data-key="${k}"><i class="fa-solid ${icon}"></i><span class="gs-k">${SLOTS[k][0]}</span><span class="gs-d">${esc(sub ? presetLabel(sub.preset || sub) : t('Do nothing'))}</span></button>`; };
  const pad = `<div class="gs-pad"><div></div>${cell('up', 'fa-arrow-up')}<div></div>${cell('left', 'fa-arrow-left')}${cell('tap', 'fa-hand-pointer')}${cell('right', 'fa-arrow-right')}<div></div>${cell('down', 'fa-arrow-down')}<div></div></div>`;
  const presets = ['gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan'].map(k => `<button class="pill ${g.label === S.presets.all[k].label ? 'on' : ''}" data-act="gesture-preset" data-key="${k}">${esc(t(S.presets.all[k].label.replace('Gestures: ', '')))}</button>`).join(''); // i18n: data
  const opts = card(`<div class="row"><span class="grow lbl">${t('Mode')}</span><span class="seg"><button class="${g.continuous ? '' : 'on'}" data-act="gest-mode" data-key="once">${t('One-shot')}</button><button class="${g.continuous ? 'on' : ''}" data-act="gest-mode" data-key="continuous">${t('Continuous')}</button></span></div>` +
    `<div class="row"><span class="grow lbl">${t('Sensitivity')}</span>${range('data-act="gest-sens"', sens, 1, 10, 1)}<span class="val" style="width:24px;text-align:right">${sens}</span></div>`);
  return `<div class="ring-page gest-page">${pad}<div class="gs-opts">${opts}<div class="chips">${presets}</div></div></div>`;
}
function pageGestures(d) {
  const cid = gestureControl(d), g = gestureObject(d, cid), slot = SLOTS[S.dir][1];
  const a = assignment(d, 'buttons', cid); const active = (typeof a === 'string' ? (S.presets.all[a] || {}) : (a || {})).type === 'gesture';
  const mode = isRingAction(a) ? 'ring' : active ? 'gestures' : 'off';
  const sens = Math.max(1, Math.min(10, Math.round((165 - (g.threshold ?? 60)) / 15)));
  // opened from a button's Configure gestures: laid out like the action ring, the directions as a pad
  // in the middle naming what each runs, the picked one's actions in the panel on the right
  // an app hovered in the bar while configuring: its own ring or gestures are shown in place; when the
  // button does something else in that app, a note says what, and the view keeps its kind
  if (S.cfgFrom && S.previewProfile) {
    const own = assignment(d, 'buttons', cid, S.editProfile || 'default'), viewRing = isRingAction(own);
    if (!(viewRing ? mode === 'ring' : active)) {
      const pk = S.previewProfile, pn = pk === 'default' ? t('Global settings') : ((deviceProfiles(d).find(x => x.key === pk) || {}).name || pk);
      const bn = (gestureCapable(d).find(c => c.cid === cid) || {}).label || t('This button');
      return `<div class="ring-stage"><div class="pv-note"><i class="fa-solid fa-circle-info"></i><div>${t('In <b>{profile}</b>, {button} does <b>{action}</b>.', { profile: esc(pn), button: esc(bn), action: esc(presetLabel(a)) })}</div><div class="sub">${viewRing ? t('Its action ring applies where the button is set to the action ring.') : t('Its gestures apply where the button is set to gestures.')}</div></div></div>`;
    }
  }
  if (active && S.cfgFrom) return gestureStage(d, cid, g, sens);
  const seg = (k, l) => `<button class="${mode === k ? 'on' : ''}" data-act="hold-mode" data-key="${k}">${l}</button>`;
  // gestures and the action ring share the held button: choosing one turns the other off
  const holdRows = `<div class="row"><div class="grow"><div class="lbl">${t('When held')}</div><div class="sub">${mode === 'ring' ? t('Opens the action ring; gestures are off') : mode === 'gestures' ? t('Swipes run gestures; the action ring is off') : t('The button does what the mouse does by itself')}</div></div><span class="seg">${seg('gestures', t('Gestures'))}${seg('ring', t('Action ring'))}${seg('off', t('Off'))}</span></div>` +
    `<div class="row"><div class="grow"><div class="lbl">${t('Button')}</div><div class="sub">${t('Each button that can be held has its own choice')}</div></div><select class="sel" data-act="gest-button">${gestureCapable(d).map(c => { const ca = assignment(d, 'buttons', c.cid); const ct = (typeof ca === 'string' ? (S.presets.all[ca] || {}) : (ca || {})).type; return `<option value="${c.cid}" ${c.cid === cid ? 'selected' : ''}>${esc(c.label)}${isRingAction(ca) ? ' · ' + t('action ring') : ct === 'gesture' ? ' · ' + t('gestures') : ''}</option>`; }).join('')}</select></div>`;
  if (mode === 'ring') {
    return `<div class="ring-page">${ringStage()}<div class="rs-bar"><span></span><button class="btn" data-act="ring-test"><i class="fa-solid fa-play"></i>${t('Try it')}</button></div></div>`;
  }
  if (mode === 'off') return sec(t('Gesture button'), card(holdRows)) + `<div class="hint" style="margin-top:12px">${t('Pick Gestures or Action ring to give the button something to do while it is held.')}</div>`;
  const cell = (k, txt, cls = '') => `<button class="${cls} ${S.dir === k ? 'on' : ''}" data-act="dir-pick" data-key="${k}">${txt}</button>`;
  const grid = `<div class="gest-grid"><div></div>${cell('up', '↑')}<div></div>${cell('left', '←')}${cell('tap', t('Tap'), 'tap')}${cell('right', '→')}<div></div>${cell('down', '↓')}<div></div></div>`;
  const presetsRow = ['gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan'].map(k => `<button class="pill ${g.label === S.presets.all[k].label ? 'on' : ''}" data-act="gesture-preset" data-key="${k}">${esc(t(S.presets.all[k].label.replace('Gestures: ', '')))}</button>`).join(''); // i18n: data
  return `<div class="photo-col" style="grid-template-columns:240px 1fr">${grid}
    <div style="display:flex;flex-direction:column;gap:22px">
      ${sec(SLOTS[S.dir][0], card(
        `<div class="row"><span class="grow lbl">${t('Action')}</span>${drop(g[slot] && g[slot].preset ? g[slot].preset : (g[slot] || { type: 'nothing' }), `data-act="pick-gesture" data-slot="${slot}"`)}</div>` +
        `<div class="row"><span class="grow lbl">${t('Mode')}</span><span class="seg"><button class="${g.continuous ? '' : 'on'}" data-act="gest-mode" data-key="once">${t('One-shot')}</button><button class="${g.continuous ? 'on' : ''}" data-act="gest-mode" data-key="continuous">${t('Continuous')}</button></span></div>`))}
      ${sec(t('Gesture button'), card(holdRows +
        `<div class="row"><span class="grow lbl">${t('Sensitivity')}</span>${range('data-act="gest-sens"', sens, 1, 10, 1)}<span class="val" style="width:24px;text-align:right">${sens}</span></div>` +
        (g.continuous ? `<div class="row"><span class="grow lbl">${t('Repeat distance')}</span>${range('data-act="gest-step"', g.step ?? 40, 5, 120, 5)}<span class="val" style="width:24px;text-align:right">${g.step ?? 40}</span></div>` : '')))}
      ${sec(t('Presets'), `<div class="chips">${presetsRow}</div>`)}
    </div></div>`;
}

const WAVES = { 0: t('Sharp tick'), 1: t('Soft thud'), 2: t('Sharp knock'), 3: t('Soft knock'), 4: t('Light tick'), 5: t('Happy alert'), 6: t('Angry alert'), 7: t('Completed'), 8: t('Square'), 9: t('Wave'), 10: t('Firework'), 11: t('Mad'), 12: t('Knock'), 13: t('Jingle'), 14: t('Ringing'), 27: t('Whisper') };
function pageHaptics(d) {
  const st = (d.state || {}).haptic || {}, s = (d.config.settings || {}).haptic || {};
  const on = s.enabled ?? st.enabled ?? true, level = s.level ?? st.level ?? 50;
  const force = ((d.state || {}).force || [])[0], pf = (d.config.settings || {}).panel_force ?? (force ? force.current : 0);
  const step = force ? Math.max(1, Math.round((force.max - force.min) / 20)) : 1;
  const pct = force ? Math.round((pf - force.min) * 100 / Math.max(1, force.max - force.min)) : 0;
  const waves = (st.waveforms || []).map(w => `<button class="pill" data-act="haptic-play" data-key="${w}" ${on ? '' : 'disabled'}>${esc(WAVES[w] || t('Pattern {n}', { n: w }))}</button>`).join('');
  return sec(t('Haptic feedback'), card(
      row(t('Haptic feedback'), t('The panel under the thumb answers with a short vibration'), sw(on, 'data-act="setting" data-path="haptic.enabled"')) +
      `<div class="row"><div class="grow"><div class="lbl">${t('Strength')}</div><div class="sub">${on ? t('Felt at once when you let go of the slider') : t('Feedback is off')}</div></div>${range('data-act="haptic-level" data-out="hl"', level, 5, 100, 5)}<span class="val" data-out="hl" style="width:32px;text-align:right">${level}</span></div>`)) +
    sec(t('Felt when'), card(
      row(t('The action ring moves or runs'), t('A light tick on each action, a soft thud when one runs'), sw(s.ring ?? true, 'data-act="setting" data-path="haptic.ring"')) +
      row(t('A gesture is recognised'), t('A sharp tick when a swipe does its action'), sw(s.gestures ?? true, 'data-act="setting" data-path="haptic.gestures"')))) +
    (force ? sec(t('Haptic panel press'), card(
      `<div class="row"><div class="grow"><div class="lbl">${t('Press force')}</div><div class="sub">${t('How hard the panel has to be pressed: lower is lighter')}</div></div>${range('data-act="setting-range" data-path="panel_force" data-out="pf"' + (force.changeable ? '' : ' disabled'), pf, force.min, force.max, step)}<span class="val" data-out="pf" style="width:40px;text-align:right">${pct}%</span></div>`) +
      `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="panel-force-reset"><i class="fa-solid fa-rotate-left"></i>${t('Default force')}</button></div>`) : '') +
    sec(t('Try a pattern'), `<div class="chips">${waves}</div>`, t('plays on the mouse'));
}
// Point & scroll, laid out like the keyboard's Backlight: the mouse with a tag saying how it is set,
// its settings in the panel on the right (the tag opens the panel again once it is closed)
// Point & scroll on the mouse photo, laid out like Buttons: a ring on the scroll wheel, the thumb
// wheel and the body (pointer speed), each named beside it; a ring opens its settings on the right
const PT_NAMES = { wheel: t('Scroll wheel'), thumb: t('Thumb wheel'), pointer: t('Pointer speed') };
function ptSummary(d, k) {
  const st = d.state || {}, s = d.config.settings || {};
  if (k === 'pointer') { const dpi = s.dpi ?? (st.dpi ? st.dpi.dpi : 1000); return `${t('{dpi} DPI', { dpi })} · ${t('Speed {n}', { n: Math.round(((s.pointer_speed ?? 0) + 1) * 50) })}`; }
  if (k === 'wheel') {
    // all three of the wheel's settings: direction, smooth scrolling, SmartShift (one per line on the photo)
    const ss = s.smartshift || {}, hr = s.hires || {};
    const natural = hr.invert ?? (st.hires || {}).invert ?? false, speed = hr.speed ?? 1;
    const ratchet = (ss.mode || (st.smartshift || {}).mode || 'ratchet') === 'ratchet', shift = ss.enabled ?? false;
    return `${natural ? t('Natural') : t('Standard')} · ${hr.smooth ? t('Smooth on') : t('Smooth off')}${speed !== 1 ? ` · ${t('Speed {n}', { n: fmtOut('wsp', speed) })}` : ''} · ${!ratchet ? t('Free-spin') : shift ? t('SmartShift on') : t('Ratchet')}`;
  }
  const ti = thumbInfo(d);
  return `${t('Speed {n}', { n: ti.speed })} · ${ti.invert ? t('Inverted') : t('Standard')}`;
}
function thumbInfo(d) {
  const tw = assignment(d, 'thumbwheel'), gain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
  return { speed: Math.max(1, Math.min(10, Math.round(gain / 1.6))), invert: !!((d.config.settings || {}).thumbwheel || {}).invert };
}
function pointPhoto(d) {
  const P = MOUSE_PHOTOS[d.id];
  const shown = P.pt.filter(([k]) => k !== 'thumb' || d.controls.length);
  const on = k => backlightPanel(d) && S.ptSel === k;
  const spots = shown.map(([k, x, y]) => `<g class="hotspot ms pt ${on(k) ? 'selected' : ''}" data-cid="${k}" data-name="${esc(PT_NAMES[k])}"><circle class="ring" cx="${x}" cy="${y}" r="40"/></g>`).join('');
  // names in a column just outside the photo on the side each spot names, as on Buttons
  const GAP = 150, place = {};
  for (const side of ['l', 'r']) {
    let prev = -Infinity;
    shown.filter(s => s[3] === side).sort((p, q) => p[2] - q[2]).forEach(([k, , y]) => { const ly = Math.max(y, prev + GAP); place[k] = ly; prev = ly; });
  }
  const lines = shown.map(([k, x, y, side]) => `<polyline class="ms-line ${on(k) ? 'on' : ''}" points="${side === 'l' ? x - 40 : x + 40},${y} ${side === 'l' ? -20 : P.w + 20},${place[k]}"/>`).join('');
  const labels = shown.map(([k, , , side]) => `<div class="ms-lab ${side} ${on(k) ? 'on' : ''}" data-ring="${k}" style="top:${(place[k] / P.h * 100).toFixed(2)}%"><span class="k">${esc(PT_NAMES[k])}</span>${ptSummary(d, k).split(' · ').map(p => `<span class="d">${esc(p)}</span>`).join('')}</div>`).join('');
  return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${spots}</svg>${labels}`;
}
function pagePointer(d) {
  if (MOUSE_PHOTOS[d.id]) return `<div class="photo-card ms-photo">${pointPhoto(d)}</div>`;
  return pointerSettings(d) + thumbSettings(d);
}
// the wheel's card: direction, speed, smooth scrolling, momentum, its fine steps, SmartShift (shared by Point & scroll and a gaming mouse's Scroll wheel page)
function wheelSettings(d) {
  const st = d.state || {}, s = d.config.settings || {};
  const ss = s.smartshift || {}, hr = s.hires || {};
  const ratchet = (ss.mode || (st.smartshift || {}).mode || 'ratchet') === 'ratchet', ssOn = ratchet && (ss.enabled ?? false);
  const thr = ss.threshold ?? (st.smartshift || {}).threshold ?? 14;
  const wspeed = hr.speed ?? 1;
  return sec(t('Scroll wheel'), card(
      row(t('Scroll direction'), (hr.invert ?? (st.hires || {}).invert) ? t('Natural: the page follows your finger') : t('Standard'), sw(hr.invert ?? (st.hires || {}).invert ?? false, 'data-act="setting" data-path="hires.invert"')) +
      `<div class="row"><div class="grow"><div class="lbl">${t('Scroll speed')}</div><div class="sub">${t('How far each notch scrolls')}</div></div>${range('data-act="setting-range" data-path="hires.speed" data-out="wsp"', wspeed, 0.25, 3, 0.05)}<span class="val" data-out="wsp" style="width:40px;text-align:right">${fmtOut('wsp', wspeed)}</span></div>` +
      row(t('Smooth scrolling'), t('Each notch glides in over a moment instead of jumping'), sw(!!hr.smooth, 'data-act="setting" data-path="hires.smooth"')) +
      // with smooth scrolling, a quick flick coasts on; not on a wheel that can free-spin (SmartShift),
      // which keeps turning by itself
      (hr.smooth && !st.smartshift ? row(t('Momentum'), t('A quick flick keeps scrolling and slows to a stop'), sw(hr.momentum !== false, 'data-act="setting" data-path="hires.momentum"')) : '') +
      // over Bluetooth Linux's own Logitech driver scales the wheel: its fine steps have to stay on
      ((st.hires || {}).kernel ? row(t('High-resolution wheel'), t('Kept on for this connection: Linux\'s Logitech driver handles the wheel, and turning it off would make scrolling many times slower'), sw(true, `disabled title="${esc(t('Managed by Linux on this connection'))}"`))
        : row(t('High-resolution wheel'), t('Fine steps within each notch'), sw(hr.enabled ?? false, 'data-act="setting" data-path="hires.enabled"'))) +
      `<div class="row"><div class="grow"><div class="lbl">${t('Wheel mode')}</div><div class="sub">${ratchet ? t('Steps you can feel, notch by notch') : t('Spins freely, without steps')}</div></div><span class="seg"><button class="${ratchet ? 'on' : ''}" data-act="setting-val" data-path="smartshift.mode" data-val="ratchet">${t('Ratchet')}</button><button class="${ratchet ? '' : 'on'}" data-act="setting-val" data-path="smartshift.mode" data-val="freespin">${t('Free-spin')}</button></span></div>` +
      (ratchet ? row(t('SmartShift'), t('Switch from ratchet to free-spin when the wheel is flicked'), sw(ssOn, 'data-act="setting" data-path="smartshift.enabled"')) : '') +
      (ssOn ? `<div class="row" style="flex-direction:column;align-items:stretch;gap:8px"><div style="display:flex;justify-content:space-between;gap:12px"><div><div class="lbl">${t('Free-spin speed')}</div><div class="sub">${t('How fast a flick has to be to free the wheel')}</div></div><span class="val" data-out="sst">${thr}</span></div>${range('data-act="setting-range" data-path="smartshift.threshold" data-out="sst" style="width:100%"', thr, 1, 50, 1)}<div style="display:flex;justify-content:space-between" class="hint"><span>${t('Gentle flick')}</span><span>${t('Hard flick')}</span></div></div>` : '') +
      (ratchet && (st.smartshift || {}).tunable_torque ? `<div class="row"><div class="grow"><div class="lbl">${t('Ratchet force')}</div><div class="sub">${t('How firm each step of the wheel feels')}</div></div>${range('data-act="setting-range" data-path="smartshift.torque" data-out="sstq"', ss.torque ?? (st.smartshift || {}).torque ?? 75, 1, 100, 1)}<span class="val" data-out="sstq" style="width:24px;text-align:right">${ss.torque ?? (st.smartshift || {}).torque ?? 75}</span></div>` : '')));
}
function pointerSettings(d, only) {
  const st = d.state || {}, s = d.config.settings || {};
  const dpi = s.dpi ?? (st.dpi ? st.dpi.dpi : 1000);
  const [min, max, step] = st.dpi && st.dpi.stepped ? st.dpi.levels : [200, 8000, 50];
  const speed = Math.round(((s.pointer_speed ?? 0) + 1) * 50);
  const pointer = sec(t('Pointer'), card(
    `<div class="row" style="flex-direction:column;align-items:stretch;gap:8px"><div style="display:flex;justify-content:space-between"><span class="lbl">${t('DPI')}</span><span class="val" data-out="dpi">${dpi}</span></div>${range('data-act="dpi" data-out="dpi" style="width:100%"', dpi, min, max, step)}<div style="display:flex;justify-content:space-between" class="hint"><span>${min}</span><span>${max}</span></div></div>` +
    `<div class="row"><span class="grow lbl">${t('Desktop pointer speed')}</span>${range('data-act="pspeed" data-out="pspeed"', speed, 0, 100, 5)}<span class="val" data-out="pspeed" style="width:32px;text-align:right">${speed}</span></div>`));
  // the wheel's settings: direction, speed, smooth scrolling, its fine steps, and SmartShift (its
  // sensitivity, and the ratchet force on the MX Master 4, under it while it is on). A speed other
  // than 1 or smooth scrolling has the agent play the wheel into the desktop itself.
  const wheel = wheelSettings(d);
  return only === 'pointer' ? pointer : only === 'wheel' ? wheel : pointer + wheel;
}
// the thumb wheel's speed and direction
function thumbSettings(d) {
  if (!d.controls.length) return '';
  const tw = assignment(d, 'thumbwheel');
  const twInvert = !!((d.config.settings || {}).thumbwheel || {}).invert;
  const twGain = typeof tw === 'object' && tw && tw.gain ? tw.gain : 8;
  const twSpeed = Math.max(1, Math.min(10, Math.round(twGain / 1.6)));
  // its two settings; what it does is chosen on Buttons, like any other control
  return sec(t('Thumb wheel'), card(
    `<div class="row"><span class="grow lbl">${t('Speed')}</span>${range('data-act="thumb-speed" data-out="tws"', twSpeed, 1, 10, 1)}<span class="val" data-out="tws" style="width:24px;text-align:right">${twSpeed}</span></div>` +
    row(t('Smooth scrolling'), t('Each turn glides in over a moment instead of jumping'), sw(!!((d.config.settings || {}).thumbwheel || {}).smooth, 'data-act="setting" data-path="thumbwheel.smooth"')) +
    row(t('Scroll direction'), twInvert ? t('Inverted') : t('Standard'), sw(twInvert, 'data-act="setting" data-path="thumbwheel.invert"'))));
}

function renderPointerPanel(d) {
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">${t('Modify settings')}</span><span class="dh-sub">${esc(PT_NAMES[S.ptSel] || t('Point & scroll'))}</span></div>
    <div class="dlg-body">${S.ptSel === 'thumb' ? thumbSettings(d) : pointerSettings(d, S.ptSel)}</div>
  </div></div>`;
}

export const provide = { wheelSettings, MOUSE_PHOTOS, MOUSE_BOTTOMS, buttonRows, mousePhoto, PHYS, pageButtons, gestureStage, pageGestures, WAVES, pageHaptics, PT_NAMES, ptSummary, thumbInfo, pointPhoto, pagePointer, pointerSettings, thumbSettings, renderPointerPanel };
