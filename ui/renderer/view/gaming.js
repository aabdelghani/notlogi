// View: a gaming mouse's pages with what G HUB offers for it, drawn the NotLogi way: Sensitivity
// (presets, five DPI slots with their default and DPI shift markers, X and Y with the lift-off
// distance, report rates, HERO sensor calibration and the Sensitivity tool), Scroll wheel (BHOP),
// HITS (the inductive switches under the two main buttons, each on its own, with presets, the
// HITS code G HUB shares and its latency test), and on Settings the surface mode, the onboard
// memory and what the battery has left. Assignments is the Buttons page with the mouse's names.
import { t } from '../../shared/i18n.mjs';
import { DPI_STEPS, posFromDpi } from '../../shared/dpi.mjs';
import * as G from '../../shared/gaming.mjs';

// from the rest of the window, filled in by link()
let S, card, chk, esc, range, row, sec, sw, wheelSettings;
export function link(ctx) { ({ S, card, chk, esc, range, row, sec, sw, wheelSettings } = ctx); }

const RATES = [125, 250, 500, 1000, 2000, 4000, 8000];
// G HUB's names for its curated presets (shared/gaming.mjs keeps the slots)
const PRESET_NAMES = {
  default: t('Default settings'), first_person: t('First person'), first_person_xy: t('First person XY split'), mmorpg: t('MMORPG'), mmorpg_xy: t('MMORPG XY split'),
  moba: t('MOBA'), productivity: t('Productivity'), rts: t('RTS'), simulation: t('Simulation'), third_person: t('Third person'), third_person_xy: t('Third person XY split'),
};
const presetName = p => p ? (G.isCurated(p.id) ? PRESET_NAMES[p.id] : p.name) : t('No preset');
const LOD_NAMES = { 1: t('Low'), 2: t('Medium'), 3: t('High') };
const settingsOf = d => (d.config || {}).settings || {};
const stateOf = d => d.state || {};
// while the mouse runs on its onboard memory, what is set here waits until NotLogi takes over again
const onboardNote = d => settingsOf(d).onboard_memory ? `<div class="banner info"><i class="fa-solid fa-microchip"></i><span>${t('The mouse runs on its onboard memory: what is set here applies once NotLogi takes over again (Settings, Onboard memory).')}</span></div>` : '';

// ----------------------------------------------------------- presets
// A preset bar, the same for DPI and HITS: the one in use (marked when changed since), a menu of
// G HUB's own and one's own, and what can be done with it. Built-in presets can only be copied.
function presetBar(kind, cur, changed, list, curated, open) {
  const custom = cur && !curated(cur.id);
  const menu = open ? `<div class="menu preset-menu" data-menu>
      <div class="mhead">${kind === 'dpi' ? t('Curated presets') : t('Presets')}</div>
      ${list.filter(p => curated(p.id)).map(p => item(kind, p, cur)).join('')}
      ${list.some(p => !curated(p.id)) ? `<div class="sep"></div><div class="mhead">${t('Your presets')}</div>${list.filter(p => !curated(p.id)).map(p => item(kind, p, cur)).join('')}` : ''}
      <div class="sep"></div><button data-act="${kind}-preset-new"><i class="fa-solid fa-plus"></i><span>${t('New preset from these settings')}</span></button></div>` : '';
  const btn = (act, icon, title, on = true) => `<button class="hbtn icon" data-act="${kind}-preset-${act}" title="${title}" ${on ? '' : 'disabled'}><i class="fa-solid ${icon}"></i></button>`;
  return `<div class="row preset-bar"><i class="fa-solid ${kind === 'dpi' ? 'fa-crosshairs' : 'fa-sliders'} preset-ic"></i>
    <div class="grow" style="position:relative"><button class="drop preset-drop" data-act="${kind}-preset-menu"><span class="pname">${esc(cur ? presetName(cur) : t('Your own settings'))}</span>${changed ? `<span class="pchg">${t('changed')}</span>` : ''}<i class="fa-solid fa-chevron-down chev"></i></button>${menu}</div>
    ${btn('rename', 'fa-pen', t('Rename preset'), custom)}${btn('reset', 'fa-rotate-left', t('Reset to the preset'), !!cur && changed)}${btn('dup', 'fa-copy', t('Duplicate preset'))}${btn('delete', 'fa-trash', t('Delete preset'), custom)}</div>`;
}
const item = (kind, p, cur) => `<button data-act="${kind}-preset-pick" data-key="${esc(p.id)}"><span>${esc(presetName(p))}</span>${cur && cur.id === p.id ? '<i class="fa-solid fa-check chk"></i>' : ''}</button>`;

// ----------------------------------------------------------- sensitivity
// Five slots as G HUB lists them: the colour bar, the slot's number with the default (crosshair)
// and DPI shift (diamond) marks, the DPI on a slider (or X and Y with the lift-off distance in the
// X/Y view), the switch, and a menu. The slot in use is lit; a click on its dot picks it.
function pageDpi(d) {
  const s = settingsOf(d), st = stateOf(d), sd = st.dpi || {};
  const slots = G.currentSlots(s, st), active = G.activeSlot(s), def = G.defaultSlot(s), shift = G.shiftSlot(s), adv = !!s.dpi_advanced;
  const [min, max] = sd.slots && sd.levels ? sd.levels : [100, 48000];
  const lodOff = st.surface_mode === 'off';
  const preset = G.presetById(s, s.dpi_preset || 'default');
  const changed = !!preset && !G.presetMatches(preset, s, st);
  const rows = slots.map((sl, i) => {
    const marks = `${i === def ? `<i class="fa-solid fa-crosshairs mk def" title="${t('Default DPI')}"></i>` : ''}${i === shift ? `<i class="fa-solid fa-diamond mk shf" title="${t('DPI shift')}"></i>` : ''}`;
    const num = (axis, v) => `<input class="dpi-num" type="number" min="${min}" max="${max}" step="1" value="${v}" data-act="dpi-input" data-key="${i}" data-axis="${axis}" ${sl.on ? '' : 'disabled'} aria-label="${axis === 'y' ? t('Y DPI') : axis === 'x' ? t('X DPI') : t('DPI')}">`;
    const body = adv
      ? `<span class="dpi-xy">${num('x', sl.x)}<button class="hbtn icon dpi-link" data-act="dpi-link" data-key="${i}" title="${t('Y the same as X')}" ${sl.on ? '' : 'disabled'}><i class="fa-solid ${sl.x === sl.y ? 'fa-link' : 'fa-link-slash'}"></i></button>${num('y', sl.y)}</span>
         <span class="seg lod ${lodOff ? 'off' : ''}" title="${lodOff ? t('Lift-off distance applies while Gaming surface mode is on or automatic (Settings)') : t('Lift-off distance')}">${G.LODS.map(l => `<button class="${sl.lod === l ? 'on' : ''}" data-act="dpi-lod" data-key="${i}" data-val="${l}" ${sl.on && !lodOff ? '' : 'disabled'}>${LOD_NAMES[l]}</button>`).join('')}</span>`
      : `${range(`data-act="dpi-slot" data-path="dpi_slots.${i}" data-out="dpi${i}"${sl.on ? '' : ' disabled'}`, posFromDpi(sl.x, min, max), 0, DPI_STEPS, 1)}${num('x', sl.x)}`;
    const menu = S.menu === 'dpi-slot:' + i ? `<div class="menu slot-menu" data-menu>
        <button data-act="dpi-slot-active" data-key="${i}" ${sl.on ? '' : 'disabled'}><i class="fa-solid fa-computer-mouse"></i><span>${t('Set as active DPI')}</span></button>
        <button data-act="dpi-slot-default" data-key="${i}" ${sl.on ? '' : 'disabled'}><i class="fa-solid fa-crosshairs"></i><span>${t('Make it the default DPI')}</span></button>
        <button data-act="dpi-slot-shift" data-key="${i}" ${sl.on ? '' : 'disabled'}><i class="fa-solid fa-diamond" style="color:#f28c28"></i><span>${t('Make it the DPI shift')}</span></button>
        <div class="sep"></div><button data-act="dpi-slot-reset" data-key="${i}"><i class="fa-solid fa-rotate-left"></i><span>${t('Reset this slot')}</span></button></div>` : '';
    return `<div class="row dpi-slot ${i === active ? 'on' : ''} ${sl.on ? '' : 'disabled'} ${adv ? 'adv' : ''}"><span class="slot-bar" style="background:${G.SLOT_COLOURS[i]}"></span>
      <button class="hbtn icon slot-pick" data-act="dpi-slot-active" data-key="${i}" title="${t('Use this slot')}" ${sl.on ? '' : 'disabled'}><i class="fa-solid ${i === active ? 'fa-circle-dot' : 'fa-circle'}"></i></button>
      <span class="num">${i + 1}</span><span class="marks">${marks}</span>${body}
      ${sw(sl.on, `data-act="dpi-enable" data-key="${i}" ${i === active || i === def ? 'disabled title="' + t('The slot in use and the default slot stay on') + '"' : ''}`)}
      <div style="position:relative"><button class="hbtn icon" data-act="dpi-slot-menu" data-key="${i}" title="${t('More')}"><i class="fa-solid fa-ellipsis-vertical"></i></button>${menu}</div></div>`;
  }).join('');
  const sensor = sd.dpi ? t('The sensor is at {dpi} DPI', { dpi: sd.dpi_y && sd.dpi_y !== sd.dpi ? `${sd.dpi} × ${sd.dpi_y}` : sd.dpi }) : '';
  const legend = `<div class="hint dpi-legend"><span>${sensor}</span><span><i class="fa-solid fa-crosshairs mk def"></i> ${t('Default DPI')} &nbsp; <i class="fa-solid fa-diamond mk shf"></i> ${t('DPI shift, while its button is held')}</span></div>`;
  const xy = `<label class="xy-toggle">${chk(adv, 'data-act="dpi-advanced"')}<span>${t('X and Y')}</span></label>`;
  // the report rate: the mouse takes the one for the link it is on, the other waits for that link
  const rr = st.report_rate, wiredLink = d.transport === 'usb';
  const rateRow = (label, path, offered, inUse) => {
    const cur = s[path] ?? (rr || {})[path] ?? 1000;
    const rates = offered && offered.length ? offered : RATES;
    const sub = inUse ? t('In use now') : t('Taken when the mouse is on this link');
    return `<div class="row"><div class="grow"><div class="lbl">${label}</div><div class="sub">${rr ? sub : t('Hz; 2000 and above need the 8K receiver')}</div></div><span class="seg">${rates.map(r => `<button class="${cur === r ? 'on' : ''}" data-act="setting-val" data-path="${path}" data-val="${r}">${r}</button>`).join('')}</span></div>`;
  };
  return onboardNote(d) + sec(t('Preset'), card(presetBar('dpi', preset, changed, G.allPresets(s), G.isCurated, S.menu === 'dpi-presets'))) +
    sec(t('Sensitivity'), card(rows) + legend, xy) +
    sec(t('Report rate'), card(rateRow(t('Wireless'), 'report_rate', rr && rr.wireless, !wiredLink) + rateRow(t('Wired'), 'report_rate_wired', rr && rr.wired, wiredLink))) +
    sec(t('HERO sensor calibration'), card(calibrationRows(d))) +
    sec(t('Tools'), card(
      row(t('Sensitivity tool'), t('Try the DPI in use in a short aiming game, and keep the one that suits you'), `<button class="btn" data-act="dpi-test-open"><i class="fa-solid fa-crosshairs"></i>${t('Play')}</button>`) +
      row(t('System mouse settings'), t('The desktop\'s own pointer speed and acceleration'), `<button class="btn" data-act="os-mouse-settings"><i class="fa-solid fa-arrow-up-right-from-square"></i>${t('Open')}</button>`)));
}

// HERO sensor calibration: corrections measured against another mouse; the one chosen scales every slot
function calibrationRows(d) {
  const s = settingsOf(d), list = Array.isArray(s.sensor_corrections) ? s.sensor_corrections : [], cur = s.dpi_correction || '';
  const sel = `<select class="sel" data-act="cal-pick"><option value="" ${cur ? '' : 'selected'}>${t('None')}</option>${list.map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
  const c = list.find(x => x.id === cur);
  const details = c ? `<div class="row cal-details"><div class="grow"><div class="sub">${t('Test DPI {a} · measured {b} · adjustment {c}', { a: c.test_dpi, b: c.actual_dpi, c: (c.factor >= 1 ? '+' : '') + Math.round((c.factor - 1) * 1000) / 10 + '%' })}${c.source ? ' · ' + t('against {name}', { name: esc(c.source) }) : ''}</div></div><button class="btn sm danger" data-act="cal-delete" data-key="${esc(c.id)}"><i class="fa-solid fa-trash"></i>${t('Delete')}</button></div>` : '';
  return row(t('Correction'), t('Copy the feel of another mouse: both move the same distance, and every DPI here is adjusted to match'), `<div class="cal-ctl">${sel}<button class="btn" data-act="cal-open"><i class="fa-solid fa-ruler-horizontal"></i>${t('Calibrate')}</button></div>`) + details;
}

// ----------------------------------------------------------- scroll wheel
// BHOP as G HUB has it: a bumped wheel does not scroll; a first notch only counts when a second one
// follows within the time set
function pageWheel(d) {
  const st = stateOf(d), s = settingsOf(d);
  if (!st.bunny_hop) return st.hires || st.smartshift ? wheelSettings(d) : sec(t('Scroll wheel'), card(row(t('Nothing to set'), t('This mouse has no wheel settings of its own'), '')));
  const b = s.bunny_hop || {}, on = b.enabled ?? st.bunny_hop.enabled, ms = b.timeout ?? st.bunny_hop.timeout ?? 100;
  const body = row(t('BHOP mode'), t('Keeps a bumped wheel from scrolling: the mouse ignores a first notch unless a second one follows within the time set'), sw(!!on, 'data-act="setting" data-path="bunny_hop.enabled"')) +
    (on ? `<div class="row"><div class="grow"><div class="lbl">${t('BHOP sensitivity')}</div><div class="sub">${t('How long the mouse waits for the second notch')}</div></div><span class="hint">100 ms</span>${range('data-act="setting-range" data-path="bunny_hop.timeout" data-out="bhop"', ms, 100, 1000, 100)}<span class="hint">1000 ms</span><span class="val" data-out="bhop" style="width:64px;text-align:right">${ms} ms</span></div>` : '');
  return onboardNote(d) + `<div class="wheel-page"><img class="wheel-photo" src="../assets/devices/40be.png" alt="">${sec(t('Scroll wheel'), card(body))}</div>`;
}

// ----------------------------------------------------------- HITS
// One button or both (G HUB's All (L+R)): their actuation point, rapid trigger and click haptics.
// The picture shows each button's three values, the setting being changed lit.
function hitsSides() { return S.hitsSide === 'left' ? ['left'] : S.hitsSide === 'right' ? ['right'] : ['left', 'right']; }
function pageHits(d) {
  const s = settingsOf(d), st = stateOf(d);
  // the whole mouse in the middle; a click on a button opens its settings on the right (renderHitsPanel)
  const intro = S.hitsPanel ? '' : `<div class="hits-intro"><span class="hint">${t('Click a button to set its switch')}</span><button class="btn sm" data-act="hits-open" data-key="both"><i class="fa-solid fa-sliders"></i>${t('Set both buttons')}</button></div>`;
  return `<div class="hits-page ${S.hitsPanel ? 'panel' : ''}">${intro}${hitsPicture(G.hitsOf(s, st, 'left'), G.hitsOf(s, st, 'right'))}</div>` + onboardNote(d);
}
// The panel on the right while a button is being set (the window's nav folds away, as for a button's
// actions): which button, its actuation point, rapid trigger and click haptics, the presets, the tools
function renderHitsPanel(d) {
  const s = settingsOf(d), st = stateOf(d);
  const L = G.hitsOf(s, st, 'left'), R = G.hitsOf(s, st, 'right');
  const v = S.hitsSide === 'right' ? R : L;   // both: the left one's, until they are set together
  const differ = S.hitsSide === 'both' && G.HITS_KEYS.some(k => L[k] !== R[k]);
  const side = `<span class="seg">${[['both', t('All (L+R)')], ['left', t('Left')], ['right', t('Right')]].map(([k, l]) => `<button class="${S.hitsSide === k ? 'on' : ''}" data-act="hits-side" data-key="${k}">${l}</button>`).join('')}</span>`;
  const slider = (label, sub, field, val, lo, hi, ends, dis = false) => `<div class="hits-row ${dis ? 'disabled' : ''}"><div class="hr-head"><div><div class="lbl">${label}</div><div class="sub">${sub}</div></div><span class="val" data-out="h-${field}">${val}</span>
    <button class="hbtn icon" data-act="hits-reset-field" data-key="${field}" title="${t('Back to {v}', { v: G.HITS_DEFAULT[field] })}" ${val === G.HITS_DEFAULT[field] || dis ? 'disabled' : ''}><i class="fa-solid fa-rotate-left"></i></button></div>
    <div class="hr-slider">${range(`data-act="hits-val" data-key="${field}" data-out="h-${field}"${dis ? ' disabled' : ''}`, val, lo, hi, 1)}</div><div class="hr-ends"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`;
  const body = slider(t('Actuation point'), t('How far the button travels before it clicks'), 'actuation', v.actuation, 1, 10, [t('Short click'), t('Long click')]) +
    row(t('Rapid trigger'), t('The button resets the moment it starts to rise, ready to click again'), sw(v.rapid_trigger_on, 'data-act="hits-rt"')) +
    slider(t('Rapid trigger sensitivity'), t('How little the button has to rise to reset'), 'rapid_trigger', v.rapid_trigger, 1, 5, [t('Fast'), t('Slow')], !v.rapid_trigger_on) +
    slider(t('Click haptics'), t('The click felt on each press'), 'haptics', v.haptics, 0, 5, [t('Off'), t('Strong')]);
  const preset = G.allHitsPresets(s).find(p => p.id === (s.hits_preset || 'default')) || null;
  const changed = !!preset && !G.hitsMatches(preset, s, st);
  const tools = `<div class="hits-tools"><button class="btn" data-act="hits-code-open"><i class="fa-solid fa-link"></i>${t('HITS code')}</button><button class="btn" data-act="hits-test-open"><i class="fa-solid fa-gauge-high"></i>${t('Test HITS')}</button><button class="btn" data-act="hits-reset"><i class="fa-solid fa-rotate-left"></i>${t('Default settings')}</button></div>`;
  const who = { both: t('All (L+R)'), left: t('Left button'), right: t('Right button') }[S.hitsSide];
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel hits-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">${t('HITS')}</span><span class="dh-sub">${esc(who)}</span><button class="hbtn close" data-act="hits-close" title="${t('Close')}"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body">${card(`<div class="row"><span class="grow lbl">${t('Set for')}</span>${side}</div>` + body)}${differ ? `<div class="hint">${t('The buttons differ; a change here sets both to the value shown')}</div>` : ''}
      ${sec(t('Preset'), card(presetBar('hits', preset, changed, G.allHitsPresets(s), id => id === 'default', S.menu === 'hits-presets')))}${tools}</div>
  </div></div>`;
}
// the top of the mouse with each main button's values beside it: actuation, rapid trigger, haptics.
// The buttons are drawn over the photo by G HUB's own outlines (its device data, in the photo's
// 1410 x 2800 space): lit with a check when they are the ones being set; a click adds or drops one.
const HITS_SHAPES = {
  left: { x: 97, mark: [340, 583], d: 'M596.5 310.541V1.58545C450.455 9.67577 342.272 50.1274 282.772 74.3984C122.178 139.907 47.9691 206.309 6.90857 271.263C5.76812 290.635 1.50045 346.773 1.5 389.921C1.49916 470.824 13.5884 648.426 20.4318 756.682C30.697 886.59 55.5909 1163.9 61 1204.35C66.4091 1244.8 90.75 1255.59 112.386 1255.59C134.023 1255.59 596.5 1252.89 596.5 1252.89V810.618C547.818 810.618 530.37 797.134 523.477 789.044C503.609 765.723 504.545 753.985 504.545 694.656C504.545 635.327 503.477 420.462 504.545 395.314C505.614 370.167 512.659 352.166 520.773 341.379C537.48 319.167 561.341 310.541 596.5 310.541Z' },
  right: { x: 718, mark: [1040, 583], d: 'M1.5 311.034V1.58569C147.3 9.68892 255.301 50.205 314.701 74.5147C475.025 140.128 549.109 206.636 590.101 271.693C591.239 291.096 595.5 347.323 595.5 390.541C595.501 471.573 583.432 649.458 576.6 757.887C566.352 888.001 541.5 1165.75 536.1 1206.27C530.7 1246.78 506.4 1257.59 484.8 1257.59C463.2 1257.59 1.5 1254.88 1.5 1254.88V811.908C50.1 811.908 67.5191 798.403 74.4 790.3C94.2345 766.942 93.3 755.186 93.3 695.762C93.3 636.338 94.3671 421.13 93.3 395.943C92.2329 370.755 85.2 352.725 77.1 341.921C60.4211 319.674 36.6 311.034 1.5 311.034Z' },
};
function hitsPicture(L, R) {
  const lit = k => S.hitsField === k ? 'lit' : '';
  const on = side => S.hitsSide === 'both' || S.hitsSide === side;
  // each button's values in a box beside the mouse, joined to its check by a line (as G HUB draws it)
  const BOX = { left: { x: -620, y: 420 }, right: { x: 1630, y: 420 } }, W = 400, H = 330;
  const box = (v, side) => { const b = BOX[side], [mx, my] = HITS_SHAPES[side].mark, edge = side === 'left' ? b.x + W : b.x;
    return `<g class="hb-box ${on(side) ? '' : 'dim'}"><line x1="${side === 'left' ? mx - 36 : mx + 36}" y1="${my}" x2="${edge}" y2="${b.y + H / 2}"/>
      <foreignObject x="${b.x}" y="${b.y}" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" class="hits-badge">
      <span class="${lit('actuation')}" title="${t('Actuation point')}"><i class="fa-solid fa-arrow-down-long"></i>${v.actuation}</span>
      <span class="${lit('rapid_trigger')}" title="${t('Rapid trigger')}"><i class="fa-solid fa-arrow-up-long"></i>${v.rapid_trigger_on ? v.rapid_trigger : t('Off')}</span>
      <span class="${lit('haptics')}" title="${t('Click haptics')}"><i class="fa-solid fa-wave-square"></i>${v.haptics}</span></div></foreignObject></g>`; };
  const zone = side => { const z = HITS_SHAPES[side], [mx, my] = z.mark;
    return `<g class="hb ${on(side) ? 'on' : ''}" data-act="hits-toggle" data-key="${side}"><title>${side === 'left' ? t('Left button') : t('Right button')}</title><path transform="translate(${z.x} 0)" d="${z.d}"/><path class="hb-hatch" transform="translate(${z.x} 0)" d="${z.d}"/>
      <circle class="hb-mark" cx="${mx}" cy="${my}" r="34"/>${on(side) ? `<path class="hb-check" d="M${mx - 14} ${my + 1} l10 10 l19 -21"/>` : ''}</g>`; };
  return `<div class="hits-pic"><svg viewBox="-660 -20 2730 2840" preserveAspectRatio="xMidYMin meet"><defs><pattern id="hb-stripes" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="26" fill="rgba(255,255,255,.10)"/></pattern></defs>
    <image href="../assets/devices/40be.png" width="1410" height="2800"/>${zone('left')}${zone('right')}${box(L, 'left')}${box(R, 'right')}</svg></div>`;
}

// ----------------------------------------------------------- settings
// What Settings adds for a gaming mouse: the battery's estimate and power use, Gaming surface mode,
// and the onboard memory (the mouse's own five profiles, used when NotLogi steps back)
function gamingBattery(d) {
  const b = d.battery, s = settingsOf(d), st = stateOf(d);
  const rate = d.transport === 'usb' ? (s.report_rate_wired ?? (st.report_rate || {}).report_rate_wired ?? 1000) : (s.report_rate ?? (st.report_rate || {}).report_rate ?? 1000);
  const hap = Math.max(G.hitsOf(s, st, 'left').haptics, G.hitsOf(s, st, 'right').haptics);
  const p = G.powerUse({ rate, haptics: hap }), h = b && !b.charging && Number.isFinite(b.percent) ? G.batteryHours(b.percent, { rate, haptics: hap }) : null;
  return card(row(t('Time left'), h !== null ? t('At {rate} Hz with click haptics at {h}; a higher report rate drains it faster', { rate, h: hap }) : t('Shown while the mouse runs on its battery'), `<span class="val">${h !== null ? t('About {n} hours', { n: Math.round(h) }) : '–'}</span>`) +
    row(t('Power use'), t('System and report rate, from the mouse\'s power model'), `<span class="val">${t('{a} mW + {b} mW', { a: Math.round(p.system), b: Math.round(p.report) })}</span>`));
}
const SURFACES = ['on', 'auto', 'off'];
function gamingSettings(d) {
  const s = settingsOf(d), st = stateOf(d);
  let out = '';
  if (st.surface_mode) {
    const cur = s.surface_mode || st.surface_mode;
    const names = { on: t('On'), auto: t('Automatic'), off: t('Off') };
    const subs = { on: t('Tuned for gaming surfaces; tracking may suffer on others'), auto: t('The sensor tells the surface itself and tunes for it'), off: t('Works on the widest range of surfaces; can fix tracking problems') };
    out += sec(t('Gaming surface mode'), card(SURFACES.map(k => `<button class="row click radio-row ${cur === k ? 'on' : ''}" data-act="setting-val" data-path="surface_mode" data-val="${k}"><i class="fa-solid ${cur === k ? 'fa-circle-dot' : 'fa-circle'} rb"></i><div class="grow"><div class="lbl">${names[k]}</div><div class="sub">${subs[k]}</div></div></button>`).join('')), t('the lift-off distance applies while it is on or automatic'));
  }
  if (st.onboard) {
    const on = !!s.onboard_memory, list = (S.onboard || {})[d.id];
    const rows = Array.isArray(list) ? list.map(p => {
      const slots = (p.slots || []).map(x => x.x === x.y ? x.x : `${x.x}×${x.y}`).join(' · ');
      const cur = on && (s.onboard_profile ? s.onboard_profile === p.sector : p.current);
      return `<div class="row onb-row ${on && p.enabled ? '' : 'disabled'}"><button class="radio-pick ${cur ? 'on' : ''}" data-act="onboard-pick" data-key="${p.sector}" ${on && p.enabled ? '' : 'disabled'}><i class="fa-solid ${cur ? 'fa-circle-dot' : 'fa-circle'} rb"></i><div class="grow"><div class="lbl">${t('Profile {n}', { n: p.index })}${p.enabled ? '' : ` <span class="pchg">${t('switched off')}</span>`}</div><div class="sub">${slots ? t('DPI {list} · {rate} Hz', { list: slots, rate: p.report_rate || '–' }) : esc(p.error || '')}</div></div></button><button class="btn sm" data-act="onboard-save" data-key="${p.index}" title="${t('Write the DPI slots, report rates and HITS set in NotLogi into this profile')}"><i class="fa-solid fa-microchip"></i>${t('Save NotLogi\'s settings here')}</button></div>`;
    }).join('') : `<div class="row"><span class="grow hint">${t('Reading the mouse\'s memory…')}</span></div>`;
    out += sec(t('Onboard memory'), card(row(t('Use the onboard memory'), on ? t('The mouse runs its own profiles; NotLogi leaves its settings and buttons alone') : t('Off: NotLogi sets the mouse while it runs, as G HUB does'), sw(on, 'data-act="onboard-memory"')) + rows +
      `<div class="row"><span class="grow hint">${t('What a profile held is kept in a backup file before it is written.')}</span><button class="btn sm danger" data-act="onboard-restore"><i class="fa-solid fa-rotate-left"></i>${t('Restore all profiles')}</button></div>`));
  }
  return out;
}

// ----------------------------------------------------------- dialogs
// S.gtool says which: the HITS code, the HITS latency test, the sensor calibration, the
// Sensitivity tool
function renderGamingDialog(d) {
  const g = S.gtool || {};
  if (g.kind === 'hits-code') return dialog(t('HITS code'), hitsCodeBody(d, g), 520);
  if (g.kind === 'hits-test') return dialog(t('HITS latency test'), hitsTestBody(d, g), 860);
  if (g.kind === 'calibrate') return dialog(t('HERO sensor calibration'), calibrateBody(d, g), 620);
  if (g.kind === 'dpi-test') return dialog(t('Sensitivity tool'), dpiTestBody(d, g), 900);
  if (g.kind === 'macro') return dialog(g.id ? t('Edit macro') : t('New macro'), macroBody(g), 640);
  if (g.kind === 'macros') return dialog(t('Macros'), `<div class="dlg-body">${macrosCard(d)}</div>`, 560);
  return '';
}
const dialog = (title, body, w) => `<div class="scrim" data-act="close-dlg"><div class="dlg gdlg" style="width:${w}px" data-stop>
  <div class="dlg-head">${esc(title)}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>${body}</div></div>`;

function hitsCodeBody(d, g) {
  const s = settingsOf(d), st = stateOf(d);
  const code = G.hitsCode(G.hitsOf(s, st, 'left'), G.hitsOf(s, st, 'right'));
  const parsed = g.input ? G.parseHitsCode(g.input) : null;
  const what = v => t('actuation {a}, rapid trigger {r}, haptics {h}', { a: v.actuation, r: v.rapid_trigger_on ? v.rapid_trigger : t('off'), h: v.haptics });
  return `<div class="dlg-body" style="display:flex;flex-direction:column;gap:14px">
    <div class="hint">${t('A HITS code carries both buttons\' settings, as G HUB shares them. Give yours to someone, or take theirs.')}</div>
    <div class="sec-title"><span>${t('Your code')}</span></div>
    <div class="code-row"><code class="hits-code">${esc(code)}</code><button class="btn" data-act="hits-code-copy" data-key="${esc(code)}"><i class="fa-solid fa-copy"></i>${g.copied ? t('Copied') : t('Copy')}</button></div>
    <div class="sec-title"><span>${t('Use a code')}</span></div>
    <input class="text" data-act="hits-code-input" placeholder="${t('Paste a HITS code')}" value="${esc(g.input || '')}">
    ${g.input ? (parsed ? `<div class="hint ok"><i class="fa-solid fa-check"></i> ${t('Left: {l}. Right: {r}.', { l: what(parsed.left), r: what(parsed.right) })}</div>` : `<div class="hint err"><i class="fa-solid fa-triangle-exclamation"></i> ${t('That is not a HITS code for this mouse')}</div>`) : ''}
  </div><div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="close-dlg">${t('Close')}</button><button class="btn primary" data-act="hits-code-apply" ${parsed ? '' : 'disabled'}>${t('Use this code')}</button></div></div>`;
}

// The latency test: wait for blue, click; the mouse stamps when the button passed each step of its
// travel, so the time to the chosen actuation point shows against a traditional switch (step 5)
function hitsTestBody(d, g) {
  const s = settingsOf(d), st = stateOf(d), side = g.side || 'left', v = G.hitsOf(s, st, side);
  const phaseText = { idle: t('Click here to start'), wait: t('Wait for blue…'), go: t('Click!'), measuring: t('Click!'), soon: t('You clicked too soon!'), sleep: t('Zzz… are you asleep?'), none: t('The click did not come through'), done: '' }[g.phase || 'idle'];
  const r = g.result;
  const ms = x => x === null || x === undefined ? '– ms' : Number.isFinite(x) ? t('{n} ms', { n: Math.abs(Math.round(x)) }) : '∞ ms';
  const result = r ? `<div class="lat"><div class="lat-big ${r.saved ? 'ok' : 'err'}"><span class="k">${r.saved ? t('Time saved') : t('Time lost')}</span><span class="v">${ms(r.diff)}</span><span class="m">${r.tooFast ? t('Pressed faster than the mouse reports its travel: press a little slower to see the difference') : !Number.isFinite(r.diff) ? t('Faster than a traditional switch can tell') : r.saved ? t('HITS is saving you time on every click') : t('Try a lower actuation point to save time')}</span></div>
    <div class="lat-row"><span><i class="fa-solid fa-chevron-right" style="color:var(--acc)"></i>${t('Your HITS setting')}</span><b>${ms(r.hits)}</b></div><div class="lat-row"><span><i class="fa-solid fa-chevron-right" style="color:var(--dim)"></i>${t('Traditional switch')}</span><b>${ms(r.traditional)}</b></div>
    <div class="lat-scale">${(() => {
      // each step's moment within the press: the first step reached low, the last high, unreached steps flat
      const got = r.scale.filter(x => x.ms !== null && x.ms !== undefined).map(x => x.ms), lo = Math.min(...got), hi = Math.max(...got);
      return r.scale.map(x => `<span class="${x.step === v.actuation ? 'hits' : x.step === 5 ? 'trad' : ''} ${x.ms === null || x.ms === undefined ? 'none' : ''}" style="height:${x.ms === null || x.ms === undefined ? 6 : hi > lo ? 20 + 80 * (x.ms - lo) / (hi - lo) : 60}%" title="${t('Step {s}', { s: x.step })}: ${ms(x.ms)}"></span>`).join('');
    })()}</div><div class="lat-axis"><span>${t('Short click')}</span><span>${t('Long click')}</span></div><div class="hint">${t('Click again to restart')}</div></div>` : '';
  return `<div class="dlg-body hits-test"><div class="ht-left">
      <div class="hint">${t('See how much time your actuation point saves on each click against a traditional gaming mouse switch, which acts at about step 5. When the box turns blue, click in it as fast as you can.')}</div>
      <div class="row"><span class="grow lbl">${t('Button')}</span><span class="seg"><button class="${side === 'left' ? 'on' : ''}" data-act="hits-test-side" data-key="left">${t('Left')}</button><button class="${side === 'right' ? 'on' : ''}" data-act="hits-test-side" data-key="right">${t('Right')}</button></span></div>
      <div class="ht-ap"><div class="ht-ap-h"><span class="lbl">${t('Actuation point')}</span><span class="val" data-out="h-tap">${v.actuation}</span></div><div class="ht-slider"><span class="hint">${t('Short click')}</span>${range(`data-act="hits-test-ap" data-out="h-tap"`, v.actuation, 1, 10, 1)}<span class="hint">${t('Long click')}</span></div>
        <div class="ht-travel" data-hits-travel title="${t('How far the button is pressed now')}">${Array.from({ length: 10 }, (_, i) => `<span class="${i + 1 <= (g.travel || 0) ? 'fill' : ''} ${i + 1 === v.actuation ? 'ap' : ''} ${i + 1 === 5 ? 'trad' : ''}"></span>`).join('')}</div></div>
      <div class="hint">${t('The report rate is set to 1000 Hz while the test is open and put back after.')}</div>
    </div><div class="ht-area ${g.phase || 'idle'}" data-hits-area>${result || `<span>${phaseText}</span>${['soon', 'sleep', 'none'].includes(g.phase) ? `<span class="ht-again">${t('Click again to restart')}</span>` : ''}`}</div></div>`;
}

// Calibration: the source mouse (one connected here, or another at a DPI typed in), both moved
// side by side about 10 inches, then the measured DPI and the adjustment, named and saved
function calibrateBody(d, g) {
  const others = (S.devices || []).filter(x => x.id !== d.id && x.kind === 'mouse');
  const step = g.step || 1;
  if (step === 1) {
    return `<div class="dlg-body" style="display:flex;flex-direction:column;gap:12px">
      <div class="hint">${t('Adjust this mouse to feel like another one. You will move both mice together about 10 inches (25 cm); a mouse pad around 14 inches (35 cm) long works well.')}</div>
      <div class="row"><span class="grow lbl">${t('Source mouse')}</span><select class="sel" data-act="cal-source">${others.map(x => `<option value="${esc(x.id)}" ${g.source === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="" ${g.source ? '' : 'selected'}>${t('Another mouse')}</option></select></div>
      <div class="row"><div class="grow"><div class="lbl">${t('Its DPI')}</div><div class="sub">${t('As that mouse is set now; between {a} and {b}', { a: 100, b: 48000 })}</div></div><input class="dpi-num" type="number" min="100" max="48000" value="${g.sourceDpi || 800}" data-act="cal-source-dpi"></div>
      <div class="row"><span class="grow lbl">${t('This mouse')}</span><span class="val">${esc(d.name)} · ${t('{n} DPI', { n: g.testDpi || ((d.state || {}).dpi || {}).dpi || 800 })}</span></div>
    </div><div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="close-dlg">${t('Cancel')}</button><button class="btn primary" data-act="cal-start" ${g.source !== undefined ? '' : ''}>${t('Next')}</button></div></div>`;
  }
  if (step === 2) {
    const pct = Math.min(100, Math.round(g.progress || 0));
    return `<div class="dlg-body" style="display:flex;flex-direction:column;gap:14px">
      <div class="lbl" style="font-size:16px">${t('Move the mice')}</div>
      <div class="hint">${t('Hold both mice side by side and move them together, straight across, until the bar is full. Lift them and come back as often as you need.')}</div>
      <div class="meter cal-meter"><i style="width:${pct}%"></i></div>
      <div class="hint">${g.error ? `<span class="err">${esc(g.error)}</span>` : t('{a} counts from this mouse, {b} from the source', { a: g.dest || 0, b: g.src || 0 })}</div>
    </div><div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="cal-cancel">${t('Cancel')}</button>${g.error ? `<button class="btn primary" data-act="cal-start">${t('Try again')}</button>` : ''}</div></div>`;
  }
  const c = g.result || {};
  const extreme = c.factor < 0.75 || c.factor > 1.33;
  return `<div class="dlg-body" style="display:flex;flex-direction:column;gap:12px">
    <div class="lbl" style="font-size:16px">${t('Calibration details')}</div>
    <div class="hint">${extreme ? t('This mouse is adjusted to match the source, but the adjustment is large: check the source\'s DPI and calibrate again if it feels wrong.') : t('This mouse is adjusted to match the source.')}</div>
    <div class="card">${row(t('Test DPI'), t('The DPI both mice were tested at'), `<span class="val">${c.test_dpi}</span>`)}${row(t('Measured DPI'), t('What this mouse really moved at'), `<span class="val">${c.actual_dpi}</span>`)}${row(t('Adjustment'), t('Applied to every DPI of this mouse'), `<span class="val">${(c.factor >= 1 ? '+' : '') + Math.round((c.factor - 1) * 1000) / 10}%</span>`)}</div>
    <div class="row"><span class="grow lbl">${t('Name')}</span><input class="text" data-act="cal-name" value="${esc(g.name || '')}" placeholder="${t('A name for this calibration')}"></div>
  </div><div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="cal-start">${t('Calibrate again')}</button><button class="btn primary" data-act="cal-save">${t('Save')}</button></div></div>`;
}

// The Sensitivity tool: targets to hit at the DPI in use; then the stats and a hint whether a
// lower or higher DPI would serve better; quitting keeps the DPI tried
function dpiTestBody(d, g) {
  const s = settingsOf(d), sl = G.currentSlots(s, stateOf(d))[G.activeSlot(s)];
  const st = g.stats;
  const advice = st ? (st.over > st.under + 2 ? t('Next round, try a slightly lower DPI to overshoot less.') : st.under > st.over + 2 ? t('Next round, try a slightly higher DPI to undershoot less.') : st.hits < 14 ? t('Next round, focus on accuracy.') : t('Next round, try to reach the targets faster.')) : '';
  const stats = st ? `<div class="dt-stats"><div><span class="k">${t('DPI')}</span><b>${st.dpi}</b></div><div><span class="k">${t('Speed')}</span><b>${t('{n} ms', { n: st.speed })}</b></div><div><span class="k">${t('Performance')}</span><b>${st.score}</b></div><div><span class="k">${t('Hits')}</span><b>${st.hits}/20</b></div></div>
    <div class="hint">${st.over === st.under ? t('You overshot and undershot {n} times each, with {p} perfect hits.', { n: st.over, p: st.perfect }) : t('You overshot {o} times and undershot {u} times, with {p} perfect hits.', { o: st.over, u: st.under, p: st.perfect })} ${advice}</div>` : '';
  return `<div class="dlg-body dpi-test"><div class="dt-side">
      <div class="hint">${t('Hit as many targets as you can in 20 tries. Lower sensitivities help you aim and spare your wrist.')}</div>
      <div class="row"><div class="grow"><div class="lbl">${t('Active DPI')}</div><div class="sub">${t('A change here is kept in the slot in use')}</div></div><input class="dpi-num" type="number" min="100" max="48000" value="${sl.x}" data-act="dpi-input" data-key="${G.activeSlot(s)}" data-axis="x"></div>
      ${stats}<div style="display:flex;gap:8px"><button class="btn primary" data-act="dpi-test-play"><i class="fa-solid fa-play"></i>${st ? t('Play again') : t('Play')}</button><button class="btn" data-act="close-dlg">${t('Quit')}</button></div>
    </div><div class="dt-arena ${g.playing ? 'playing' : ''}" data-dpi-arena>${g.playing ? `<div class="dt-target" style="left:${g.tx}%;top:${g.ty}%"></div><div class="dt-count">${g.n || 0}/20</div>` : `<span class="hint">${t('Press Play, then click the targets')}</span>`}</div></div>`;
}

// ----------------------------------------------------------- macros
// A macro's keys as recorded: each one down or up, with the wait before it; recording takes the keys
// pressed while the box has the focus
const keyLabel = k => k.replace(/^KEY_/, '').replace(/^BTN_/, '').replace('LEFT', 'L-').replace('RIGHT', 'R-');
function macroBody(g) {
  const steps = g.steps.map((x, i) => `${i && x.delay ? `<span class="mstep-d">${g.standard ? 50 : x.delay} ms</span>` : ''}<button class="mstep ${x.down ? 'dn' : 'up'}" data-act="macro-step-del" data-key="${i}" title="${t('Remove this step')}"><i class="fa-solid ${x.down ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>${esc(keyLabel(x.key))}</button>`).join('');
  const seg = (act, cur, opts) => `<span class="seg">${opts.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-key="${k}">${l}</button>`).join('')}</span>`;
  return `<div class="dlg-body" style="display:flex;flex-direction:column;gap:12px">
    <div class="row"><span class="grow lbl">${t('Name')}</span><input class="text" data-act="macro-name" value="${esc(g.name)}"></div>
    <div class="row"><div class="grow"><div class="lbl">${t('Plays')}</div><div class="sub">${{ once: t('All of it, once per press'), while_held: t('Over and over while the button is held'), toggle: t('Starts with one press, stops with the next') }[g.repeat]}</div></div>${seg('macro-repeat', g.repeat, [['once', t('Once')], ['while_held', t('While held')], ['toggle', t('Toggle')]])}</div>
    <div class="row"><span class="grow lbl">${t('Delays')}</span>${seg('macro-delays', g.standard ? 'standard' : 'recorded', [['recorded', t('As recorded')], ['standard', t('50 ms each')]])}</div>
    <div class="mrec ${g.recording ? 'on' : ''}" tabindex="0" data-macro-rec>${steps || `<span class="hint">${g.recording ? t('Press the keys now…') : t('Press Record, then the keys of the macro')}</span>`}</div>
    <div style="display:flex;gap:8px"><button class="btn ${g.recording ? 'primary' : ''}" data-act="macro-record"><i class="fa-solid ${g.recording ? 'fa-stop' : 'fa-circle'}" style="${g.recording ? '' : 'color:var(--err)'}"></i>${g.recording ? t('Stop') : t('Record')}</button><button class="btn" data-act="macro-clear" ${g.steps.length ? '' : 'disabled'}><i class="fa-solid fa-eraser"></i>${t('Clear')}</button><button class="btn" data-act="macro-test" ${g.steps.length ? '' : 'disabled'}><i class="fa-solid fa-play"></i>${t('Try it')}</button></div>
  </div><div class="dlg-foot">${g.id ? `<button class="btn danger" data-act="macro-delete"><i class="fa-solid fa-trash"></i>${t('Delete')}</button>` : '<span></span>'}<div class="r"><button class="btn" data-act="close-dlg">${t('Cancel')}</button><button class="btn primary" data-act="macro-save" ${g.steps.length ? '' : 'disabled'}>${g.assignTo ? t('Save and assign') : t('Save')}</button></div></div>`;
}
// the device's macros under its buttons, to edit or start a new one
function macrosCard(d) {
  const list = Array.isArray(settingsOf(d).macros) ? settingsOf(d).macros : [];
  const rows = list.map(m => row(esc(m.name), t('{n} steps · {how}', { n: m.steps.length, how: { once: t('once'), while_held: t('while held'), toggle: t('toggle') }[m.repeat] || '' }), `<button class="btn sm" data-act="macro-edit" data-key="${esc(m.id)}"><i class="fa-solid fa-pen"></i>${t('Edit')}</button>`)).join('');
  return card((rows || row(t('No macros yet'), t('Record keys once, then give the macro to any button from its menu'), '')) + `<div class="row"><span class="grow"></span><button class="btn" data-act="macro-new"><i class="fa-solid fa-plus"></i>${t('New macro')}</button></div>`);
}
// beside the layers on the Assignments page: the macros, with how many there are
function macrosButton(d) {
  const n = Array.isArray(settingsOf(d).macros) ? settingsOf(d).macros.length : 0;
  return `<button class="btn sm" data-act="macros-open"><i class="fa-solid fa-keyboard"></i>${t('Macros')}${n ? `<span class="count">${n}</span>` : ''}</button>`;
}

// an app profile's sensitivity: the global one (the Sensitivity page), or a preset of its own while that app is in front
function sensitivityRow(d, profile) {
  if (profile === 'default') return row(t('Sensitivity'), t('Set on the Sensitivity page; an app can have a preset of its own'), '');
  const own = (((d.config || {}).profiles || {})[profile] || {}).sensitivity;
  const opts = G.allPresets(settingsOf(d));
  const sel = `<select class="sel" data-act="app-sens" data-dev="${d.id}" data-profile="${esc(profile)}"><option value="" ${own ? '' : 'selected'}>${t('Same as Default')}</option>${opts.map(p => `<option value="${esc(p.id)}" ${own && own.id === p.id ? 'selected' : ''}>${esc(presetName(p))}</option>`).join('')}</select>`;
  return `<div class="row"><span class="ov-dot ${own ? 'on' : ''}"></span><div class="grow"><div class="lbl" style="${own ? '' : 'color:var(--dim)'}">${t('Sensitivity')}</div>${own ? `<div class="sub">${t('DPI {list}', { list: own.slots.filter(x => x.on !== false).map(x => own.advanced && x.y !== x.x ? `${x.x}×${x.y}` : x.x).join(' · ') })}</div>` : ''}</div>${sel}</div>`;
}

// the travel bar repainted in place as the mouse reports the button moving (many times a second)
function paintTravel(level) {
  const bar = document.querySelector('[data-hits-travel]'); if (!bar) return;
  [...bar.children].forEach((c, i) => c.classList.toggle('fill', i + 1 <= level));
}

export const provide = { macrosButton, renderHitsPanel, paintTravel, pageDpi, pageWheel, pageHits, gamingBattery, gamingSettings, renderGamingDialog, hitsSides, sensitivityRow };
