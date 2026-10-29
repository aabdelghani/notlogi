// View model: a gaming mouse's settings and tools (the PRO X3 SUPERSTRIKE): presets, DPI slots,
// HITS, the HITS code and latency test, HERO sensor calibration, the Sensitivity tool, the
// surface mode and the onboard memory. The rules are in shared/gaming.mjs.
import { t } from '../../shared/i18n.mjs';
import { dpiFromPos } from '../../shared/dpi.mjs';
import * as G from '../../shared/gaming.mjs';
import { codeToKey } from '../../shared/actions.mjs';

// from the rest of the window, filled in by link()
let S, api, call, changed, fx, go, paintTravel, prompt, setAssign, toast;
export function link(ctx) { ({ S, api, call, changed, fx, go, paintTravel, prompt, setAssign, toast } = ctx); }

// which button the HITS page sets (both, left, right), which of its settings was touched last (lit
// on the picture), whether Assignments shows the G-Shift layer, the open tool, the onboard profiles
export const state = { wheelPanel: false, hitsPanel: false, hitsSide: 'both', hitsField: null, gshiftLayer: false, gtool: null, onboard: {} };

const settingsOf = d => (d.config || {}).settings || (d.config.settings = {});
// Several settings in one request (a preset): kept here at once, so the page does not flicker
async function setMany(d, items) {
  if (!items.length) return;
  const s = settingsOf(d);
  for (const { path, value } of items) { let x = s; for (const p of path.slice(0, -1)) { if (typeof x[p] !== 'object' || x[p] === null) x[p] = {}; x = x[p]; } x[path.at(-1)] = value; }
  changed();
  try { d.state = await call('set_settings', { id: d.id, items }); } catch (e) { toast(e.message, true); }
  changed();
}
// A preset of one's own takes every change made while it is chosen, as G HUB's do; a curated one
// stays as it is and shows as changed until it is reset or saved as a copy
async function keepInPreset(d) {
  const s = settingsOf(d), id = s.dpi_preset;
  if (!id || G.isCurated(id) || !Array.isArray(s.dpi_presets)) return;
  const list = s.dpi_presets.map(p => p.id === id ? G.presetFrom(s, d.state || {}, p.id, p.name) : p);
  await setMany(d, [{ path: ['dpi_presets'], value: list }]);
}
async function keepInHitsPreset(d) {
  const s = settingsOf(d), id = s.hits_preset;
  if (!id || id === 'default' || !Array.isArray(s.hits_presets)) return;
  const list = s.hits_presets.map(p => p.id === id ? Object.assign({}, p, { left: G.hitsOf(s, d.state || {}, 'left'), right: G.hitsOf(s, d.state || {}, 'right') }) : p);
  await setMany(d, [{ path: ['hits_presets'], value: list }]);
}
const dpiSet = async (d, items) => { await setMany(d, items); await keepInPreset(d); };
const hitsSet = async (d, items) => { await setMany(d, items); await keepInHitsPreset(d); };

// DPI presets: G HUB's curated ones and one's own
function presetCommands(kind) {
  const listKey = kind === 'dpi' ? 'dpi_presets' : 'hits_presets', curKey = kind === 'dpi' ? 'dpi_preset' : 'hits_preset';
  const curated = id => kind === 'dpi' ? G.isCurated(id) : id === 'default';
  const all = s => kind === 'dpi' ? G.allPresets(s) : G.allHitsPresets(s);
  const own = s => Array.isArray(s[listKey]) ? s[listKey] : [];
  const snapshot = (d, id, name) => {
    const s = settingsOf(d);
    return kind === 'dpi' ? G.presetFrom(s, d.state || {}, id, name) : { id, name, left: G.hitsOf(s, d.state || {}, 'left'), right: G.hitsOf(s, d.state || {}, 'right') };
  };
  const apply = (d, p) => kind === 'dpi' ? setMany(d, G.presetItems(p)) : setMany(d, G.hitsItems(p.left, ['left']).concat(G.hitsItems(p.right, ['right']), [{ path: ['hits_preset'], value: p.id }]));
  const nameOf = (s, id) => { const p = all(s).find(x => x.id === id); return p ? (curated(id) ? (kind === 'dpi' ? t('Preset') : t('Default settings')) : p.name) : ''; };
  const create = (d, base) => prompt(t('New preset'), [{ key: 'name', label: t('Name'), value: G.freeName(base, own(settingsOf(d)).map(p => p.name)) }], async v => {
    const s = settingsOf(d), name = (v.name || '').trim() || base;
    const p = snapshot(d, G.newId(kind === 'dpi' ? 'p' : 'h', all(s).map(x => x.id)), name);
    await setMany(d, [{ path: [listKey], value: own(s).concat([p]) }, { path: [curKey], value: p.id }]);
  }, t('Save'));
  return {
    [`${kind}-preset-menu`]: async () => { S.menu = S.menu === `${kind}-presets` ? null : `${kind}-presets`; changed(); },
    [`${kind}-preset-pick`]: async (it, e, d, key) => { S.menu = null; const p = all(settingsOf(d)).find(x => x.id === key); if (p) await apply(d, p); },
    [`${kind}-preset-new`]: async (it, e, d) => { S.menu = null; create(d, t('My preset')); },
    [`${kind}-preset-dup`]: async (it, e, d) => { const s = settingsOf(d); create(d, t('{name} copy', { name: nameOf(s, s[curKey] || 'default') || t('Preset') })); },
    [`${kind}-preset-rename`]: async (it, e, d) => {
      const s = settingsOf(d), id = s[curKey], p = own(s).find(x => x.id === id); if (!p) return;
      prompt(t('Rename preset'), [{ key: 'name', label: t('Name'), value: p.name }], async v => { const name = (v.name || '').trim(); if (!name) return; await setMany(d, [{ path: [listKey], value: own(settingsOf(d)).map(x => x.id === id ? Object.assign({}, x, { name }) : x) }]); }, t('Rename'));
    },
    [`${kind}-preset-reset`]: async (it, e, d) => { const s = settingsOf(d), p = all(s).find(x => x.id === (s[curKey] || 'default')); if (p) await apply(d, p); },
    [`${kind}-preset-delete`]: async (it, e, d) => {
      const s = settingsOf(d), id = s[curKey], p = own(s).find(x => x.id === id); if (!p) return;
      S.confirm = { title: t('Delete {name}?', { name: p.name }), text: t('The preset goes; the mouse keeps the settings it has now.'), ok: t('Delete'), onOk: () => setMany(d, [{ path: [listKey], value: own(settingsOf(d)).filter(x => x.id !== id) }, { path: [curKey], value: kind === 'dpi' ? '' : 'default' }]) };
      S.dlg = 'confirm'; changed();
    },
  };
}

// ----------------------------------------------------------- HITS test
// The mouse reports when the button passes each step of its travel (the agent stamps them); the box
// turns blue after a random wait, and the click's steps against that moment give the result
let hitsTimer = null, travelKeep = null;
// a travel report while the test is open: the bar under the slider follows the tested button
function hitsTravel(data) {
  const g = S.gtool; if (!g || g.kind !== 'hits-test' || data.id !== S.dev) return;
  g.travel = data[g.side === 'right' ? 'right' : 'left'] || 0;
  paintTravel(g.travel);
}
async function hitsTestClick(d, phase) {
  const g = S.gtool; if (!g || g.kind !== 'hits-test') return;
  if (phase === 'down') {
    if (g.phase === 'wait') { clearTimeout(hitsTimer); g.phase = 'soon'; call('hits_test', { id: d.id, op: 'stop' }).catch(() => {}); changed(); return; }
    if (g.phase === 'go') { g.downAt = performance.now(); return; }
    // idle or a result shown: start a round
    g.result = null; g.phase = 'wait'; changed();
    try { await call('hits_test', { id: d.id, op: 'start', button: g.side === 'right' ? 1 : 0 }); } catch (e) { g.phase = 'none'; g.error = e.message; changed(); return; }
    hitsTimer = setTimeout(async () => {
      if (!S.gtool || S.gtool.phase !== 'wait') return;
      try { await call('hits_test', { id: d.id, op: 'blue' }); } catch (e) {}
      S.gtool.phase = 'go'; changed();
      hitsTimer = setTimeout(() => { if (S.gtool && S.gtool.phase === 'go') { S.gtool.phase = 'sleep'; call('hits_test', { id: d.id, op: 'stop' }).catch(() => {}); changed(); } }, 5000);
    }, 1500 + Math.random() * 2500);
    return;
  }
  if (phase === 'up' && g.phase === 'go') {
    clearTimeout(hitsTimer);
    g.phase = 'measuring';   // one result per round, however many clicks land meanwhile
    let r = null;
    try { r = await call('hits_test', { id: d.id, op: 'result' }); } catch (e) {}
    const times = r && r.steps ? r.steps : null;
    const v = G.hitsOf(settingsOf(d), d.state || {}, g.side || 'left');
    if (!times || !Object.keys(times).length) { g.phase = 'none'; changed(); return; }
    g.result = G.hitsLatency(times, v.actuation); g.phase = 'done';
    // the press went from top to bottom between two of the mouse's travel reports (about 17 ms
    // apart): too fast to tell the steps apart, as G HUB's test cannot either
    g.result.tooFast = Object.values(times).every(x => x === times[1]);
    changed();
  }
}

// ----------------------------------------------------------- Sensitivity tool
// Twenty targets; each try counts a hit or a miss and whether the pointer overshot or fell short
function dpiTestNext(g) { g.tx = 8 + Math.random() * 84; g.ty = 10 + Math.random() * 80; g.shown = performance.now(); }
function dpiTestClick(d, x, y, w, h) {
  const g = S.gtool; if (!g || g.kind !== 'dpi-test' || !g.playing) return;
  const dx = x - g.tx * w / 100, dy = y - g.ty * h / 100, dist = Math.hypot(dx, dy), r = 22;
  const from = g.from || { x: w / 2, y: h / 2 }, toT = Math.hypot(g.tx * w / 100 - from.x, g.ty * h / 100 - from.y), toClick = Math.hypot(x - from.x, y - from.y);
  g.n = (g.n || 0) + 1; g.times.push(performance.now() - g.shown);
  if (dist <= r) { g.hits++; if (dist <= r / 3) g.perfect++; }
  else if (toClick > toT) g.over++; else g.under++;
  g.from = { x, y };
  if (g.n >= 20) {
    const s = settingsOf(d), sl = G.currentSlots(s, d.state || {})[G.activeSlot(s)];
    const speed = Math.round(g.times.reduce((a, b) => a + b, 0) / g.times.length);
    g.stats = { dpi: sl.x, speed, hits: g.hits, over: g.over, under: g.under, perfect: g.perfect, score: Math.round(g.hits * 1000 / Math.max(300, speed)) };
    g.playing = false;
  } else dpiTestNext(g);
  changed();
}

// ----------------------------------------------------------- calibration
// Both mice moved together: the agent counts each one's raw movement; the source's counts at its DPI
// give the distance, and this mouse's counts over it its real DPI
let calPoll = null;
async function calStart(d) {
  const g = S.gtool; clearInterval(calPoll);
  Object.assign(g, { step: 2, progress: 0, src: 0, dest: 0, error: null });
  g.testDpi = ((d.state || {}).dpi || {}).dpi || 800;
  changed();
  try { await call('motion_count', { op: 'start', ids: [d.id].concat(g.source ? [g.source] : []) }); } catch (e) { g.error = e.message; changed(); return; }
  const t0 = Date.now();
  calPoll = setInterval(async () => {
    if (!S.gtool || S.gtool.kind !== 'calibrate' || S.gtool.step !== 2) { clearInterval(calPoll); call('motion_count', { op: 'stop' }).catch(() => {}); return; }
    let r; try { r = await call('motion_count', { op: 'read' }); } catch (e) { return; }
    const dest = (r[d.id] || {}).dist || 0, src = g.source ? (r[g.source] || {}).dist || 0 : 0;
    g.dest = dest; g.src = src;
    // 10 inches at the DPI each one runs at
    const want = 10 * (g.source ? (g.sourceDpi || 800) : g.testDpi);
    g.progress = Math.min(100, (g.source ? src : dest) * 100 / want);
    if (Date.now() - t0 > 60000) { clearInterval(calPoll); call('motion_count', { op: 'stop' }).catch(() => {}); g.error = t('The calibration timed out after 60 seconds. Try again.'); changed(); return; }
    if (g.progress >= 100) {
      clearInterval(calPoll); call('motion_count', { op: 'stop' }).catch(() => {});
      if (!g.source) { g.error = t('Pick a source mouse connected here: the other mouse has to be counted too.'); changed(); return; }
      if (dest < 100) { g.error = t('This mouse did not move with the other one. Hold both together and try again.'); changed(); return; }
      const actual = Math.round(dest * (g.sourceDpi || 800) / src);
      const factor = Math.max(0.2, Math.min(5, g.testDpi / actual));
      const src_ = (S.devices || []).find(x => x.id === g.source);
      g.result = { test_dpi: g.testDpi, actual_dpi: actual, factor: Math.round(factor * 10000) / 10000, source: src_ ? src_.name : '' };
      g.name = G.freeName(src_ ? src_.name : t('Correction'), (settingsOf(d).sensor_corrections || []).map(c => c.name));
      g.step = 3;
    }
    changed();
  }, 100);
}

export const commands = Object.assign({}, presetCommands('dpi'), presetCommands('hits'), {
  // ------------------------------------------------- DPI slots
  'dpi-slot': async (it, e, d) => { const [lo, hi] = ((d.state || {}).dpi || {}).levels || [100, 48000]; const i = it.data.path.split('.')[1]; const v = dpiFromPos(Number(it.value), lo, hi); await dpiSet(d, [{ path: ['dpi_slots', i], value: v }].concat(settingsOf(d).dpi_advanced ? [] : [{ path: ['dpi_slots_y', i], value: v }])); },
  'dpi-input': async (it, e, d, key) => {
    const v = Math.round(Number(it.value)); if (!Number.isFinite(v) || v <= 0) { changed(); return; }
    const axis = it.data.axis === 'y' ? 'dpi_slots_y' : 'dpi_slots', adv = settingsOf(d).dpi_advanced;
    await dpiSet(d, [{ path: [axis, key], value: v }].concat(!adv && axis === 'dpi_slots' ? [{ path: ['dpi_slots_y', key], value: v }] : []));
  },
  'dpi-link': async (it, e, d, key) => { const sl = G.currentSlots(settingsOf(d), d.state || {})[Number(key)]; await dpiSet(d, [{ path: ['dpi_slots_y', key], value: sl.x }]); },
  'dpi-lod': async (it, e, d, key) => { await dpiSet(d, [{ path: ['dpi_lod', key], value: Number(it.data.val) }]); },
  'dpi-enable': async (it, e, d, key) => { await dpiSet(d, [{ path: ['dpi_enabled', key], value: !it.on }]); },
  'dpi-advanced': async (it, e, d) => {
    // back to one value per slot: Y follows X again
    const on = !it.on, s = settingsOf(d), items = [{ path: ['dpi_advanced'], value: on }];
    if (!on) G.currentSlots(s, d.state || {}).forEach((sl, i) => items.push({ path: ['dpi_slots_y', String(i)], value: sl.x }));
    await dpiSet(d, items);
  },
  'dpi-slot-menu': async (it, e, d, key) => { S.menu = S.menu === 'dpi-slot:' + key ? null : 'dpi-slot:' + key; changed(); },
  'dpi-slot-active': async (it, e, d, key) => { S.menu = null; await setMany(d, [{ path: ['dpi_active'], value: Number(key) }]); },
  'dpi-slot-default': async (it, e, d, key) => { S.menu = null; await dpiSet(d, [{ path: ['dpi_default'], value: Number(key) }]); },
  'dpi-slot-shift': async (it, e, d, key) => { S.menu = null; await dpiSet(d, [{ path: ['dpi_shift'], value: Number(key) }]); },
  'dpi-slot-reset': async (it, e, d, key) => {
    S.menu = null;
    const s = settingsOf(d), p = G.presetById(s, s.dpi_preset || 'default') || G.DPI_PRESETS[0], sl = p.slots[Number(key)];
    await dpiSet(d, [{ path: ['dpi_slots', key], value: sl.x }, { path: ['dpi_slots_y', key], value: sl.y }, { path: ['dpi_lod', key], value: sl.lod || 2 }, { path: ['dpi_enabled', key], value: sl.on !== false }]);
  },
  // ------------------------------------------------- calibration
  'cal-pick': async (it, e, d) => { await setMany(d, [{ path: ['dpi_correction'], value: it.value || '' }]); },
  'cal-delete': async (it, e, d, key) => {
    const s = settingsOf(d), c = (s.sensor_corrections || []).find(x => x.id === key); if (!c) return;
    S.confirm = { title: t('Delete {name}?', { name: c.name }), text: t('Every DPI goes back to what the sensor gives without this correction.'), ok: t('Delete'), onOk: () => setMany(d, [{ path: ['sensor_corrections'], value: (settingsOf(d).sensor_corrections || []).filter(x => x.id !== key) }, { path: ['dpi_correction'], value: '' }]) };
    S.dlg = 'confirm'; changed();
  },
  'cal-open': async (it, e, d) => { const other = (S.devices || []).find(x => x.id !== d.id && x.kind === 'mouse'); S.gtool = { kind: 'calibrate', step: 1, source: other ? other.id : '', sourceDpi: other && other.state && other.state.dpi ? other.state.dpi.dpi : 800 }; S.dlg = 'gaming'; changed(); },
  'cal-source': async (it) => { S.gtool.source = it.value; const o = (S.devices || []).find(x => x.id === it.value); if (o && o.state && o.state.dpi) S.gtool.sourceDpi = o.state.dpi.dpi; changed(); },
  'cal-source-dpi': async (it) => { S.gtool.sourceDpi = Math.max(100, Math.min(48000, Math.round(Number(it.value)) || 800)); changed(); },
  'cal-start': async (it, e, d) => { await calStart(d); },
  'cal-cancel': async () => { clearInterval(calPoll); call('motion_count', { op: 'stop' }).catch(() => {}); S.gtool.step = 1; changed(); },
  'cal-name': async (it) => { S.gtool.name = it.value; },
  'cal-save': async (it, e, d) => {
    const g = S.gtool, s = settingsOf(d), list = Array.isArray(s.sensor_corrections) ? s.sensor_corrections : [];
    const name = (g.name || '').trim() || t('Correction');
    if (list.some(c => c.name === name)) { toast(t('That name is in use already'), true); return; }
    const c = Object.assign({ id: G.newId('c', list.map(x => x.id)), name }, g.result);
    S.dlg = null; S.gtool = null;
    await setMany(d, [{ path: ['sensor_corrections'], value: list.concat([c]) }, { path: ['dpi_correction'], value: c.id }]);
  },
  // ------------------------------------------------- tools
  'dpi-test-open': async () => { S.gtool = { kind: 'dpi-test' }; S.dlg = 'gaming'; changed(); },
  'dpi-test-play': async () => { const g = S.gtool; Object.assign(g, { playing: true, n: 0, hits: 0, over: 0, under: 0, perfect: 0, times: [], stats: null, from: null }); dpiTestNext(g); changed(); },
  'os-mouse-settings': async () => {
    const os = (S.appInfo && S.appInfo.platform) || 'linux';
    const cmd = os === 'darwin' ? 'open "x-apple.systempreferences:com.apple.Mouse-Settings.extension"' : os === 'win32' ? 'start ms-settings:mousetouchpad' : 'gnome-control-center mouse || systemsettings kcm_mouse';
    call('run_action', { action: { type: 'command', cmd } }).catch(err => toast(err.message, true));
  },
  // ------------------------------------------------- HITS
  'hits-side': async (it, e, d, key) => { S.hitsSide = key; changed(); },
  'hits-open': async (it, e, d, key) => { S.hitsSide = key || 'both'; S.hitsPanel = true; changed(); },
  'hits-close': async () => { S.hitsPanel = false; S.menu = null; changed(); },
  'wheel-open': async () => { S.wheelPanel = true; changed(); },
  // a button clicked on the picture joins or leaves what is set (both is G HUB's All (L+R)); one stays
  'hits-toggle': async (it, e, d, key) => {
    // the panel closed: this button alone, its settings open on the right
    if (!S.hitsPanel) { S.hitsSide = key; S.hitsPanel = true; changed(); return; }
    const set = new Set(S.hitsSide === 'both' ? ['left', 'right'] : [S.hitsSide]);
    if (set.has(key) && set.size > 1) set.delete(key); else set.add(key);
    S.hitsSide = set.size === 2 ? 'both' : [...set][0]; changed();
  },
  'hits-val': async (it, e, d, key) => { S.hitsField = key; await hitsSet(d, G.hitsItems({ [key]: Number(it.value) }, viewSides())); },
  'hits-rt': async (it, e, d) => { S.hitsField = 'rapid_trigger'; await hitsSet(d, G.hitsItems({ rapid_trigger_on: !it.on }, viewSides())); },
  'hits-reset-field': async (it, e, d, key) => { S.hitsField = key; await hitsSet(d, G.hitsItems({ [key]: G.HITS_DEFAULT[key] }, viewSides())); },
  'hits-reset': async (it, e, d) => { await setMany(d, G.hitsItems(G.HITS_DEFAULT).concat([{ path: ['hits_preset'], value: 'default' }])); },
  'hits-code-open': async () => { S.gtool = { kind: 'hits-code', input: '' }; S.dlg = 'gaming'; changed(); },
  'hits-code-copy': async (it, e, d, key) => { try { await api.host.copy(key); S.gtool.copied = true; changed(); } catch (err) { toast(err.message, true); } },
  'hits-code-input': async (it) => { S.gtool.input = it.value; changed(); },
  'hits-code-apply': async (it, e, d) => {
    const c = G.parseHitsCode(S.gtool.input); if (!c) return;
    S.dlg = null; S.gtool = null;
    await hitsSet(d, G.hitsItems(c.left, ['left']).concat(G.hitsItems(c.right, ['right'])));
    toast(t('HITS code applied'));
  },
  'hits-test-open': async (it, e, d) => {
    S.gtool = { kind: 'hits-test', side: S.hitsSide === 'right' ? 'right' : 'left', phase: 'idle', travel: 0 }; S.dlg = 'gaming'; changed();
    // the mouse reports the travel for 60 s at a time: asked again while the test stays open
    const open = () => call('hits_test', { id: d.id, op: 'open' }).catch(() => {});
    open(); clearInterval(travelKeep); travelKeep = setInterval(open, 40000);
  },
  'hits-test-side': async (it, e, d, key) => { S.gtool.side = key; S.gtool.result = null; S.gtool.phase = 'idle'; changed(); },
  'hits-test-ap': async (it, e, d) => { await hitsSet(d, G.hitsItems({ actuation: Number(it.value) }, [S.gtool.side || 'left'])); },
  // ------------------------------------------------- settings
  'onboard-memory': async (it, e, d) => { await setMany(d, [{ path: ['onboard_memory'], value: !it.on }]); loadOnboard(d); },
  // a profile switched on or off in the mouse's directory, its settings left as they are (G HUB's Enable)
  // (shown at once: the mouse answers with its old directory for a moment after a write, so it is read again later)
  'onboard-enable': async (it, e, d, key) => {
    try {
      await call('onboard_enable', { id: d.id, profile: Number(key), on: !it.on });
      const p = ((S.onboard || {})[d.id] || []).find(x => x.index === Number(key)); if (p) p.enabled = !it.on;
      changed();
    } catch (err) { loadOnboard(d); return; }
    setTimeout(() => loadOnboard(d), 1500);
  },
  'onboard-pick': async (it, e, d, key) => { await setMany(d, [{ path: ['onboard_profile'], value: Number(key) }]); loadOnboard(d); },
  // writing the mouse's memory: asked first, backed up by the agent, read back before it says done
  'onboard-save': async (it, e, d, key) => {
    S.confirm = { title: t('Write profile {n}?', { n: key }), text: t('Onboard profile {n} gets the DPI slots, report rates and HITS set in NotLogi, so the mouse keeps them without software. What it holds now is kept in a backup file.', { n: key }), ok: t('Write'), onOk: async () => {
      try { await call('onboard_save', { id: d.id, profile: Number(key) }); toast(t('Profile {n} written', { n: key })); } catch (err) { toast(err.message, true); }
      loadOnboard(d);
    } };
    S.dlg = 'confirm'; changed();
  },
  'onboard-restore': async (it, e, d) => {
    S.confirm = { title: t('Restore all profiles?'), text: t('Every onboard profile goes back to the mouse\'s factory profile, and only the first stays switched on. What they hold now is kept in a backup file.'), ok: t('Restore'), onOk: async () => {
      try { await call('onboard_restore', { id: d.id }); toast(t('Onboard profiles restored')); } catch (err) { toast(err.message, true); }
      loadOnboard(d);
    } };
    S.dlg = 'confirm'; changed();
  },
  // ------------------------------------------------- app profiles
  // a preset for one app: its slots kept in that app's profile (the agent needs no preset tables)
  'app-sens': async (it, e, d) => {
    const dd = S.devices.find(x => x.id === it.data.dev) || d, key = it.data.profile;
    const profs = JSON.parse(JSON.stringify((dd.config || {}).profiles || { default: {} }));
    if (!profs[key]) return;
    const p = it.value ? G.presetById(settingsOf(dd), it.value) : null;
    if (p) profs[key].sensitivity = JSON.parse(JSON.stringify(p)); else delete profs[key].sensitivity;
    try { const r = await call('set_profiles', { id: dd.id, profiles: profs }); dd.config = r.config || dd.config; } catch (err) { toast(err.message, true); }
    changed();
  },
  // ------------------------------------------------- assignments
  'gshift-layer': async (it, e, d, key) => { S.gshiftLayer = key === 'gshift'; changed(); },
  // ------------------------------------------------- macros
  // the onboard memory notice's link: Settings, at the onboard memory, and the back arrow returns here
  'onboard-goto': async () => { const from = S.page; go('info'); S.infoFrom = from; fx.reveal('#onboard-sec', { delay: 150 }); },
  'macros-open': async () => { S.gtool = { kind: 'macros' }; S.dlg = 'gaming'; changed(); },
  'macro-new': async (it, e, d) => { openMacro(d, null, null); },
  'macro-edit': async (it, e, d, key) => { openMacro(d, key, null); },
  'macro-name': async (it) => { S.gtool.name = it.value; },
  'macro-repeat': async (it, e, d, key) => { S.gtool.repeat = key; changed(); },
  'macro-delays': async (it, e, d, key) => { S.gtool.standard = key === 'standard'; changed(); },
  'macro-record': async () => { const g = S.gtool; g.recording = !g.recording; if (g.recording) g.last = performance.now(); changed(); },
  'macro-clear': async () => { S.gtool.steps = []; changed(); },
  'macro-step-del': async (it, e, d, key) => { S.gtool.steps.splice(Number(key), 1); changed(); },
  'macro-test': async (it, e, d) => { const g = S.gtool; if (!g.steps.length) return; g.recording = false; changed(); call('run_action', { id: d.id, action: { type: 'macro', repeat: 'once', steps: macroSteps(g) } }).catch(err => toast(err.message, true)); },
  'macro-save': async (it, e, d) => { await saveMacro(d); },
  'macro-delete': async (it, e, d) => {
    const g = S.gtool, id = g.id; if (!id) return;
    S.confirm = { title: t('Delete {name}?', { name: g.name }), text: t('Buttons that play it do nothing until they get another action.'), ok: t('Delete'), onOk: () => setMany(d, [{ path: ['macros'], value: (settingsOf(d).macros || []).filter(x => x.id !== id) }]) };
    S.gtool = null; S.dlg = 'confirm'; changed();
  },
});
const viewSides = () => S.hitsSide === 'left' ? ['left'] : S.hitsSide === 'right' ? ['right'] : ['left', 'right'];

// ----------------------------------------------------------- macros
// A macro is recorded in the window: each key down and up with the time since the one before (or
// G HUB's standard 50 ms), then played by the agent once, while its button is held, or on and off
const STANDARD_DELAY = 50;
function openMacro(d, id, assignTo) {
  const m = id ? ((settingsOf(d).macros || []).find(x => x.id === id)) : null;
  S.dlg = 'gaming';
  S.gtool = { kind: 'macro', dev: d.id, id: m ? m.id : null, name: m ? m.name : G.freeName(t('Macro'), (settingsOf(d).macros || []).map(x => x.name)), repeat: m ? m.repeat : 'once', steps: m ? JSON.parse(JSON.stringify(m.steps)) : [], standard: false, recording: false, last: 0, assignTo: assignTo || null };
  changed();
}
// a key from the recording box: kept with its delay; a key held down repeats only once
function macroKey(code, down, repeat) {
  const g = S.gtool; if (!g || g.kind !== 'macro' || !g.recording || repeat) return;
  const key = codeToKey(code); if (!key) return;
  const now = performance.now();
  g.steps.push({ key, down, delay: g.steps.length ? Math.min(10000, Math.round(now - g.last)) : 0 });
  g.last = now;
  changed();
}
const macroSteps = g => g.standard ? g.steps.map((x, i) => Object.assign({}, x, { delay: i ? STANDARD_DELAY : 0 })) : g.steps;
async function saveMacro(d) {
  const g = S.gtool, s = settingsOf(d), list = Array.isArray(s.macros) ? s.macros : [];
  const name = (g.name || '').trim() || t('Macro');
  if (!g.steps.length) { toast(t('Record a few keys first'), true); return; }
  // keys still down at the end go up, so a macro never leaves one held
  const held = new Set(); for (const x of g.steps) { if (x.down) held.add(x.key); else held.delete(x.key); }
  const steps = macroSteps(g).concat([...held].map(key => ({ key, down: false, delay: STANDARD_DELAY })));
  const m = { id: g.id || G.newId('m', list.map(x => x.id)), name, repeat: g.repeat, steps };
  const next = g.id ? list.map(x => x.id === g.id ? m : x) : list.concat([m]);
  const to = g.assignTo;
  S.dlg = null; S.gtool = null;
  await setMany(d, [{ path: ['macros'], value: next }]);
  if (to) { await setAssign(d, to.section, to.cid, { type: 'macro', macro: m.id, label: m.name }, to.profile); toast(t('Assigned {action}', { action: t('Macro: {name}', { name }) })); }
}

// the onboard profiles are read from the mouse's memory when Settings opens (a few hundred ms)
async function loadOnboard(d) {
  try { S.onboard = Object.assign({}, S.onboard, { [d.id]: await call('onboard_profiles', { id: d.id }) }); changed(); } catch (e) {}
}
// leaving a tool: whatever it started on the mouse stops
function closeTool() {
  const g = S.gtool; if (!g) return;
  clearTimeout(hitsTimer); clearInterval(calPoll); clearInterval(travelKeep);
  if (g.kind === 'hits-test') call('hits_test', { id: S.dev, op: 'close' }).catch(() => {});
  if (g.kind === 'calibrate') call('motion_count', { op: 'stop' }).catch(() => {});
}

export const provide = { hitsTravel, loadOnboard, closeTool, hitsTestClick, dpiTestClick, openMacro, macroKey };
