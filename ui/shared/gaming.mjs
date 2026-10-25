// A G-series gaming mouse (the PRO X3 SUPERSTRIKE) as G HUB knows it: its sensitivity presets,
// the HITS switches, the HITS code G HUB shares, and its power model. No window, no agent: the
// pages and the tests use the same rules.

// G HUB's slot colours (the first is grey here: white would vanish on a light theme)
export const SLOT_COLOURS = ['#8a8f98', '#f28c28', '#5fd38d', '#f2d33c', '#e04fc0'];
export const SLOTS = 5;
export const DEFAULT_SLOTS = [800, 1200, 1600, 2400, 3200];
export const LODS = [1, 2, 3];   // lift-off distance: low, medium, high

// G HUB's curated presets (its defaults for this mouse, MSA_PREFAB_*): X, Y, lift-off and whether
// the slot is on; the default slot and the DPI shift slot counted from 0
const slot = (x, y = x, on = true, lod = 2) => ({ x, y, lod, on });
export const DPI_PRESETS = [
  { id: 'default', name: 'Default settings', advanced: false, def: 0, shift: 0, slots: [slot(800), slot(1200), slot(1600), slot(2400), slot(3200)] },
  { id: 'first_person', name: 'First person', advanced: false, def: 1, shift: 0, slots: [slot(400), slot(800), slot(1600), slot(2000, 2000, false), slot(2400, 2400, false)] },
  { id: 'first_person_xy', name: 'First person XY split', advanced: true, def: 1, shift: 0, slots: [slot(400, 200), slot(600, 400), slot(800, 600), slot(1000, 800, false), slot(1200, 1000, false)] },
  { id: 'mmorpg', name: 'MMORPG', advanced: false, def: 1, shift: 0, slots: [slot(1000), slot(1200), slot(1400), slot(1600), slot(2000, 2000, false)] },
  { id: 'mmorpg_xy', name: 'MMORPG XY split', advanced: true, def: 1, shift: 0, slots: [slot(1000, 600), slot(1200, 800), slot(1400, 1000), slot(1600, 1000, false), slot(2000, 1200, false)] },
  { id: 'moba', name: 'MOBA', advanced: false, def: 1, shift: 0, slots: [slot(1600), slot(1800), slot(2200), slot(2600), slot(3000, 3000, false)] },
  { id: 'productivity', name: 'Productivity', advanced: false, def: 1, shift: 0, slots: [slot(1600), slot(2000), slot(2500), slot(3000), slot(3500, 3500, false)] },
  { id: 'rts', name: 'RTS', advanced: false, def: 1, shift: 0, slots: [slot(1000), slot(1200), slot(1600), slot(2000), slot(2500, 2500, false)] },
  { id: 'simulation', name: 'Simulation', advanced: false, def: 1, shift: 0, slots: [slot(1200), slot(1600), slot(2000), slot(2500), slot(3000, 3000, false)] },
  { id: 'third_person', name: 'Third person', advanced: false, def: 1, shift: 0, slots: [slot(400), slot(800), slot(1200), slot(1600), slot(2000, 2000, false)] },
  { id: 'third_person_xy', name: 'Third person XY split', advanced: true, def: 1, shift: 0, slots: [slot(800, 400), slot(1000, 600), slot(1200, 800), slot(1600, 1200, false), slot(2000, 1600, false)] },
];

const pick = (o, i, def) => { const v = o && o[String(i)]; return v === undefined || v === null ? def : v; };

// The five slots as the mouse is set now: what NotLogi keeps, else what the sensor reports, else
// the mouse's own defaults
export function currentSlots(settings = {}, state = {}) {
  const sd = state.dpi || {}, adv = !!settings.dpi_advanced;
  return Array.from({ length: SLOTS }, (_, i) => {
    const x = pick(settings.dpi_slots, i, (sd.slots || [])[i] ?? DEFAULT_SLOTS[i]);
    return { x, y: adv ? pick(settings.dpi_slots_y, i, x) : x, lod: pick(settings.dpi_lod, i, (sd.lods || [])[i] || 2), on: pick(settings.dpi_enabled, i, true) !== false };
  });
}
export const defaultSlot = s => Math.max(0, Math.min(4, (s || {}).dpi_default ?? 0));
export const shiftSlot = s => Math.max(0, Math.min(4, (s || {}).dpi_shift ?? 0));
export const activeSlot = s => Math.max(0, Math.min(4, (s || {}).dpi_active ?? 0));

// What choosing a preset writes: every slot, the X/Y view, the default and shift slots, and the
// default slot as the one in use (as G HUB does when a preset is picked)
export function presetItems(p) {
  const items = [];
  p.slots.forEach((s, i) => {
    items.push({ path: ['dpi_slots', String(i)], value: s.x }, { path: ['dpi_slots_y', String(i)], value: s.y }, { path: ['dpi_lod', String(i)], value: s.lod || 2 }, { path: ['dpi_enabled', String(i)], value: s.on !== false });
  });
  items.push({ path: ['dpi_advanced'], value: !!p.advanced }, { path: ['dpi_default'], value: p.def || 0 }, { path: ['dpi_shift'], value: p.shift || 0 }, { path: ['dpi_active'], value: p.def || 0 }, { path: ['dpi_preset'], value: p.id });
  return items;
}
// a preset of one's own from the slots as they are now
export function presetFrom(settings, state, id, name) {
  return { id, name, advanced: !!settings.dpi_advanced, def: defaultSlot(settings), shift: shiftSlot(settings), slots: currentSlots(settings, state) };
}
// the slots still match the preset they came from (else the preset shows as changed)
export function presetMatches(p, settings, state) {
  if (!p) return false;
  const cur = currentSlots(settings, state), adv = !!settings.dpi_advanced;
  return adv === !!p.advanced && defaultSlot(settings) === (p.def || 0) && shiftSlot(settings) === (p.shift || 0) &&
    p.slots.every((s, i) => s.x === cur[i].x && (!adv || s.y === cur[i].y) && (s.lod || 2) === cur[i].lod && (s.on !== false) === cur[i].on);
}
export const allPresets = settings => DPI_PRESETS.concat(Array.isArray((settings || {}).dpi_presets) ? settings.dpi_presets : []);
export const presetById = (settings, id) => allPresets(settings).find(p => p.id === id) || null;
export const isCurated = id => DPI_PRESETS.some(p => p.id === id);
// a short id for something new, unique among the ids given
export function newId(prefix, taken = []) {
  for (let n = 1; ; n++) { const id = `${prefix}${Date.now().toString(36)}${n > 1 ? n : ''}`; if (!taken.includes(id)) return id; }
}
// the first free "<base> <n>" name
export function freeName(base, names = []) {
  if (!names.includes(base)) return base;
  for (let n = 2; ; n++) if (!names.includes(`${base} ${n}`)) return `${base} ${n}`;
}

// --------------------------------------------------------------- HITS
export const HITS_DEFAULT = { actuation: 5, rapid_trigger: 2, rapid_trigger_on: false, haptics: 3 };
export const HITS_KEYS = ['actuation', 'rapid_trigger', 'rapid_trigger_on', 'haptics'];
// One button's values (side: 'left' or 'right'): its own, else those for both, else what the
// mouse holds, else G HUB's defaults
export function hitsOf(settings = {}, state = {}, side = 'left') {
  const h = settings.hits || {}, own = h[side] || {};
  const dev = (((state.hits || {}).buttons) || [])[side === 'right' ? 1 : 0] || {};
  const out = {};
  for (const k of HITS_KEYS) out[k] = own[k] ?? (typeof h[k] !== 'object' ? h[k] : undefined) ?? dev[k] ?? HITS_DEFAULT[k];
  return out;
}
// what setting both buttons, or one, writes
export function hitsItems(values, sides = ['left', 'right']) {
  const items = [];
  for (const side of sides) for (const k of HITS_KEYS) if (values[k] !== undefined) items.push({ path: ['hits', side, k], value: values[k] });
  return items;
}
export const HITS_PRESET_DEFAULT = { id: 'default', name: 'Default settings', left: HITS_DEFAULT, right: HITS_DEFAULT };
export const allHitsPresets = settings => [HITS_PRESET_DEFAULT].concat(Array.isArray((settings || {}).hits_presets) ? settings.hits_presets : []);
export function hitsMatches(p, settings, state) {
  if (!p) return false;
  const l = hitsOf(settings, state, 'left'), r = hitsOf(settings, state, 'right');
  return HITS_KEYS.every(k => p.left[k] === l[k] && p.right[k] === r[k]);
}

// G HUB's HITS code: 16 digits in Base64. Version (2), the left and right actuation points (2 + 2),
// rapid trigger sensitivity (2 + 2), rapid trigger on (1 + 1), click haptics (2 + 2). A code typed
// in without the Base64 is taken as well, as G HUB does.
const two = n => String(Math.floor(Number(n) || 0)).padStart(2, '0');
export function hitsCode(left, right) {
  const s = '00' + two(left.actuation) + two(right.actuation) + two(left.rapid_trigger) + two(right.rapid_trigger) +
    (left.rapid_trigger_on ? '1' : '0') + (right.rapid_trigger_on ? '1' : '0') + two(left.haptics) + two(right.haptics);
  return b64(s);
}
export function parseHitsCode(text) {
  const raw = String(text || '').replace(/\s/g, '');
  if (!raw) return null;
  let digits = null;
  try { const d = unb64(raw); if (/^\d{16}$/.test(d)) digits = d; } catch (e) {}
  if (!digits && /^\d{16}$/.test(raw)) digits = raw;
  if (!digits) return null;
  const n = (a, b) => parseInt(digits.slice(a, b), 10);
  const left = { actuation: n(2, 4), rapid_trigger: n(6, 8), rapid_trigger_on: digits[10] === '1', haptics: n(12, 14) };
  const right = { actuation: n(4, 6), rapid_trigger: n(8, 10), rapid_trigger_on: digits[11] === '1', haptics: n(14, 16) };
  const ok = v => v.actuation >= 1 && v.actuation <= 10 && v.rapid_trigger >= 1 && v.rapid_trigger <= 5 && v.haptics >= 0 && v.haptics <= 5;
  return ok(left) && ok(right) ? { version: n(0, 2), left, right } : null;
}
const b64 = s => typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'latin1').toString('base64');
const unb64 = s => typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('latin1');

// HITS latency test, as G HUB works it out: the mouse stamps the moment each button crosses each of
// the ten travel steps; the HITS setting acts at the chosen step, a traditional switch at about 5.
// times: { step: ms after the target turned blue }. Time saved is positive, lost negative,
// Infinity when the press never reached step 5 (too light for a traditional switch to notice).
export function hitsLatency(times, step) {
  const at = s => (times && Number.isFinite(times[s]) ? times[s] : null);
  const hits = at(step), traditional = at(5);
  const diff = hits !== null && traditional !== null ? traditional - hits : Infinity;
  return { hits, traditional, diff, saved: hits !== null && (traditional === null || traditional >= hits), scale: Array.from({ length: 10 }, (_, i) => ({ step: i + 1, ms: at(i + 1) })) };
}

// --------------------------------------------------------------- power
// G HUB's power model for this mouse (battery.xml, in mW at 3.91 V): the sensor and its report
// rate, the processor, the analog switches, click haptics, and the radio per report interval
export const POWER = {
  capacityMWh: 1173,
  sensor: { 8000: 9.314, 4000: 4.332, 2000: 2.267, 1000: 1.279 },
  mcu: 1.796,
  analog: { 8000: 1.216, 4000: 1.216, 2000: 1.216, 1000: 0.608 },
  haptics: [0, 0.126, 0.152, 0.189, 0.311, 0.440],
  report: { 8000: 19.928, 4000: 10.34, 2000: 8.543, 1000: 4.272, 500: 2.136, 250: 1.068, 125: 0.534 },
  // G HUB's estimate runs on the nominal-voltage consumption, a fixed share of the total for this
  // mouse (from its own reading: 72 % at 1000 Hz with haptics 3 is about 141 hours)
  nominal: 0.7355,
};
const near = (table, hz, fallback) => { const ks = Object.keys(table).map(Number).sort((a, b) => a - b); const k = ks.find(v => v >= hz) ?? ks[ks.length - 1]; return table[k] ?? fallback; };
export function powerUse({ rate = 1000, haptics = 3 } = {}) {
  const system = near(POWER.sensor, rate, 1.279) + POWER.mcu + near(POWER.analog, rate, 0.608) + (POWER.haptics[Math.max(0, Math.min(5, haptics))] || 0);
  return { system, report: near(POWER.report, rate, 4.272) };
}
export function batteryHours(percent, opts) {
  if (!Number.isFinite(percent)) return null;
  const p = powerUse(opts);
  return (percent / 100) * POWER.capacityMWh / ((p.system + p.report) * POWER.nominal);
}
