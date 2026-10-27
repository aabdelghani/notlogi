// View: a keyboard's pages: its keys and the backlight.
import { isNative, isMouse } from '../../shared/profiles.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, assignment, card, drawerUp, esc, fmtOut, overridden, presetLabel, range, row, sec, sw;
export function link(ctx) { ({ S, assignment, card, drawerUp, esc, fmtOut, overridden, presetLabel, range, row, sec, sw } = ctx); }

// One photo per keyboard model, keyed by the device id the agent uses (its product id in hex:
// the Bluetooth pid, or the receiver-side pid when it comes through a receiver). Each spot is a
// control id with the centre of its key cap in photo pixels; only the controls the connected
// keyboard reports are drawn; a spot may add its own width, height and corner radius (the K650's
// round media buttons). A keyboard with no entry here gets no photo, only the key tiles.
const KEYBOARD_PHOTOS = (() => {
  const s = { src: '../assets/devices/b378.png', w: 2596, h: 800, kw: 99, kh: 75, hosts: [[0, 1800, 145], [1, 1915, 145], [2, 2030, 145]], spots: [[199, 288, 142], [200, 402, 142], [226, 517, 142], [227, 632, 142], [259, 749, 143], [264, 862, 142], [284, 976, 142], [228, 1090, 142], [229, 1206, 142], [230, 1320, 142], [231, 1433, 142], [232, 1547, 142], [233, 1663, 142], [10, 2157, 142], [266, 2274, 142], [234, 2388, 142], [111, 2503, 142]] };
  const keys = { src: '../assets/devices/b35b.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [224, 399, 109], [225, 488, 109], [110, 575, 109], [226, 665, 109], [227, 753, 109], [228, 842, 109], [229, 931, 109], [230, 1019, 109], [231, 1108, 109], [232, 1194, 109], [233, 1284, 109], [10, 1665, 109], [191, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
  const mac = { src: '../assets/devices/b361.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [224, 399, 109], [225, 488, 109], [226, 575, 109], [227, 665, 109], [228, 753, 109], [229, 842, 109], [230, 931, 109], [231, 1019, 109], [232, 1108, 109], [233, 1194, 109], [13, 1284, 109], [10, 1665, 109], [191, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
  const business = { src: '../assets/devices/b363.png', w: 2004, h: 618, kw: 76, kh: 57, spots: [[199, 222, 109], [200, 310, 109], [226, 399, 109], [227, 488, 109], [259, 575, 109], [264, 665, 109], [284, 753, 109], [228, 842, 109], [229, 931, 109], [230, 1019, 109], [231, 1108, 109], [232, 1194, 109], [233, 1284, 109], [10, 1665, 109], [266, 1755, 109], [234, 1844, 109], [111, 1932, 109]] };
  const mini = { src: '../assets/devices/b369.png', w: 1382, h: 616, kw: 77, kh: 58, spots: [[226, 424, 114], [227, 513, 114], [259, 602, 114], [264, 689, 114], [266, 778, 114], [284, 866, 114], [229, 955, 114], [231, 1043, 114], [232, 1132, 114], [233, 1220, 114]] };
  const miniMac = { src: '../assets/devices/b36a.png', w: 1634, h: 725, kw: 91, kh: 68, spots: [[226, 498, 125], [227, 604, 125], [259, 709, 125], [264, 815, 125], [266, 918, 125], [284, 1023, 125], [229, 1129, 125], [231, 1233, 125], [232, 1338, 125], [233, 1444, 125], [285, 1548, 125]] };
  const miniBusiness = { src: '../assets/devices/b36e.png', w: 1382, h: 616, kw: 77, kh: 58, spots: [[226, 424, 114], [227, 513, 114], [259, 602, 114], [264, 689, 114], [266, 778, 114], [284, 866, 114], [229, 955, 114], [231, 1043, 115], [232, 1132, 114], [233, 1220, 114]] };
  const k650 = { src: '../assets/devices/b36f.png', w: 2739, h: 1156, kw: 115, kh: 86, spots: [[199, 370, 212], [200, 488, 212], [224, 605, 212], [265, 723, 212], [259, 871, 212], [264, 993, 212], [266, 1112, 212], [284, 1230, 212], [206, 1378, 212], [287, 1498, 212], [238, 1619, 212], [288, 1737, 212], [166, 1999, 212], [24, 2114, 212], [10, 2257, 212], [110, 2372, 212], [212, 2488, 212], [111, 2605, 212], [221, 1878, 317], [228, 604, 86, 64, 64, 32], [229, 722, 85, 64, 64, 32], [230, 840, 85, 64, 64, 32], [231, 1881, 85, 64, 64, 32], [232, 1994, 84, 64, 64, 32], [233, 2111, 85, 64, 64, 32], [280, 1999, 315], [281, 1997, 430], [282, 2112, 315], [283, 2112, 430]] };
  return { b378: s, b379: s, b37a: s, b35b: keys, '408a': keys, b361: mac, '4092': mac, b363: business, b369: mini, b36e: miniBusiness, b36a: miniMac, b36f: k650, b370: k650 };
})();
function keyboardPhoto(d, plain) {
  const P = KEYBOARD_PHOTOS[d.id];
  if (!P) return '';
  const hot = plain ? '' : P.spots.filter(([cid]) => d.controls.some(c => c.cid === cid)).map(([cid, x, y, w = P.kw, h = P.kh, r = 12]) => {
    const a = assignment(d, 'keys', cid); const ctl = d.controls.find(c => c.cid === cid);
    const editing = drawerUp() && S.picker.cid === cid;
    return `<g class="hotspot key-photo ${isNative(a) ? '' : 'assigned'} ${overridden(d, 'keys', cid) ? 'pv' : ''} ${editing ? 'selected' : ''}" data-section="keys" data-cid="${cid}" data-name="${esc(ctl ? ctl.label : cid)}" data-does="${esc(isNative(a) ? (ctl ? ctl.label : t('Default')) : presetLabel(a))}" data-custom="${isNative(a) ? '' : '1'}"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${r}"/></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${hot}</svg>`;
}

function pageKeys(d) {
  // only the keyboard: hovering a key says what it does, clicking it opens its actions beside it
  const photo = keyboardPhoto(d);
  return photo ? `<div class="kb-photo">${photo}</div><div class="kb-tip" hidden></div>` : sec(t('Keys'), card(row(t('No photo for this keyboard'), '', '')));
}
// the tag pinned above the keyboard on the Backlight page, saying how the backlight is set right now
function backlightTag(d) {
  const st = d.state.backlight, s = (d.config.settings || {}).backlight || {}, n = st.num_levels || 8;
  const on = s.enabled ?? st.enabled, auto = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) !== 'manual';
  const level = s.level ?? st.level, dur = s.duration_hands_out ?? st.duration_hands_out ?? 5;
  const step = Math.max(1, Math.min(BL_STEPS, Math.round(level * BL_STEPS / (n - 1))));
  const bits = !on ? [t('Off')] : [auto ? t('Automatic') : t('Level {n} of {max}', { n: step, max: BL_STEPS }), dur >= 60 ? t('{n} min after hands leave', { n: Math.round(dur / 60) }) : t('{n} s after hands leave', { n: dur })].concat(s.battery_saving ? [t('Battery saving')] : []);
  return `<div class="kb-pin bl-pin" data-act="bl-open" title="${t('Backlight settings')}"><span class="k">${t('Backlight')}</span><span class="d">${esc(bits.join(' · '))}</span></div>`;
}
function pageBacklight(d) {
  if (!isMouse(d) && (d.state || {}).backlight && KEYBOARD_PHOTOS[d.id]) return `<div class="kb-photo">${keyboardPhoto(d, true)}${backlightTag(d)}</div>`;   // settings live in the panel
  const st = (d.state || {}).backlight, s = (d.config.settings || {}).backlight || {};
  if (!st) return sec(t('Backlight'), card(row(t('Not supported by this device'), '', '')));
  const on = s.enabled ?? st.enabled, manual = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) === 'manual';
  const level = manual ? (s.level ?? st.level) : st.current_level;
  const levels = Array.from({ length: st.num_levels || 8 }, (_, i) => `<button class="${on && i < level + (manual ? 1 : 0) ? (manual ? 'on' : 'auto') : ''}" style="height:${8 + i * 2.8}px" data-act="bl-level" data-key="${i}" title="${t('Level {n}', { n: i })}"></button>`).join('');
  const hint = !on ? t('Backlight is off') : manual ? t('Level {n} of {max}', { n: level, max: (st.num_levels || 8) - 1 }) : t('Set by the ambient light sensor');
  const timers = [['duration_hands_out', 'fa-hand', t('Hands away'), t('No hands over the keyboard'), 1, 60, 1], ['duration_hands_in', 'fa-keyboard', t('Hands present'), t('Typing paused'), 1, 60, 1], ['duration_powered', 'fa-plug', t('On power'), t('Charging cable connected'), 5, 600, 5]];
  const fmt = v => v >= 60 ? t('{n} min', { n: Math.round(v / 60) }) : t('{n} s', { n: v });
  return sec(t('Backlight'), card(row(t('Backlight'), '', sw(on, 'data-act="setting" data-path="backlight.enabled"')) +
      `<div class="row"><span class="grow lbl">${t('Mode')}</span><span class="seg"><button class="${manual ? '' : 'on'}" data-act="setting-val" data-path="backlight.mode" data-val="auto">${t('Automatic')}</button><button class="${manual ? 'on' : ''}" data-act="setting-val" data-path="backlight.mode" data-val="manual">${t('Manual')}</button></span></div>` +
      `<div class="row"><div class="grow"><div class="lbl">${t('Level')}</div><div class="sub">${hint}</div></div><div class="levels">${levels}</div></div>`)) +
    sec(t('Turn off after'), card(row(t('Stay on while plugged in'), t('Two hours after the last key, the most the keyboard allows; any key lights it again'), sw((s.duration_powered ?? st.duration_powered) >= 7200, 'data-act="setting" data-path="backlight.duration_powered" data-on="7200" data-off="60"')) + timers.filter(([k]) => k !== 'duration_powered' || (s.duration_powered ?? st.duration_powered) < 7200).map(([k, icon, label, desc, lo, hi, stp]) => { const v = s[k] ?? st[k]; return `<div class="row"><i class="fa-solid ${icon}" style="width:20px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${label}</div><div class="sub">${desc}</div></div><span class="stepper"><button data-act="step" data-key="${k}" data-d="${-stp}" data-lo="${lo}" data-hi="${hi}">−</button><span>${fmt(v)}</span><button data-act="step" data-key="${k}" data-d="${stp}" data-lo="${lo}" data-hi="${hi}">+</button></span></div>`; }).join('')));
}
// Backlight, laid out like a key's panel: the keyboard stays where it is, its settings on the right
const BL_STEPS = 6;
function renderBacklightPanel(d) {
  const st = d.state.backlight, s = (d.config.settings || {}).backlight || {}, n = st.num_levels || 8;
  const on = s.enabled ?? st.enabled, auto = (s.mode || (st.mode === 3 ? 'manual' : 'auto')) !== 'manual';
  const level = s.level ?? st.level, dur = s.duration_hands_out ?? st.duration_hands_out ?? 5;
  // six steps spread over the keyboard's own levels (1 .. n-1)
  const stepLevel = i => Math.max(1, Math.round(i * (n - 1) / BL_STEPS));
  const steps = Array.from({ length: BL_STEPS }, (_, k) => k + 1).map(i => `<button class="${level >= stepLevel(i) ? 'on' : ''}" style="height:${10 + i * 5}px" data-act="bl-level" data-key="${stepLevel(i)}" title="${t('Level {n} of {max}', { n: i, max: BL_STEPS })}"></button>`).join('');
  const body = row(t('Backlighting'), '', sw(on, 'data-act="setting" data-path="backlight.enabled"')) +
    (on ? `<div class="row"><div class="grow"><div class="lbl">${t('Backlight duration')}</div><div class="sub">${t('Stays on after your hands leave the keys')}</div></div></div>
      <div class="row bl-slider">${range('data-act="setting-range" data-path="backlight.duration_hands_out" data-out="bld"', dur, 1, 300, 1)}<span class="val" data-out="bld">${fmtOut('bld', dur)}</span></div>` +
      row(t('Automatic brightness'), t('Follows the light in the room'), sw(auto, 'data-act="setting" data-path="backlight.mode" data-on="auto" data-off="manual"')) +
      (auto ? '' : `<div class="row"><div class="grow"><div class="lbl">${t('Brightness')}</div><div class="sub">${t('Level {n} of {max}', { n: Math.max(0, [...Array(BL_STEPS).keys()].filter(k => level >= stepLevel(k + 1)).length), max: BL_STEPS })}</div></div><div class="levels">${steps}</div></div>`) : '') +
    row(t('Stay on while plugged in'), t('Two hours after the last key, the most the keyboard allows; any key lights it again'), sw((s.duration_powered ?? st.duration_powered) >= 7200, 'data-act="setting" data-path="backlight.duration_powered" data-on="7200" data-off="60"')) +
    row(t('Battery saving mode'), t('Backlight off at 20% battery or less, until charging'), sw(!!s.battery_saving, 'data-act="setting" data-path="backlight.battery_saving"'));
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">${t('Modify settings')}</span><span class="dh-sub">${t('Backlight')}</span></div>
    <div class="dlg-body"><div class="card">${body}</div></div>
    <div class="dlg-foot"><button class="btn flat" data-act="bl-reset"><i class="fa-solid fa-rotate-left"></i>${t('Reset backlighting')}</button></div>
  </div></div>`;
}

export const provide = { KEYBOARD_PHOTOS, keyboardPhoto, pageKeys, backlightTag, pageBacklight, BL_STEPS, renderBacklightPanel };
