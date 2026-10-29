import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Gaming from '../renderer/view/gaming.js';
import * as Core from '../renderer/vm/core.js';
import { dpiFromPos, posFromDpi } from '../shared/dpi.mjs';

// the gaming pages drawn for a PRO X3 SUPERSTRIKE with nothing but its saved settings (no device here)
const html = { card: b => `<card>${b}</card>`, sec: (t, b, note = '') => `<sec title="${t}" note="${note}">${b}</sec>`,
  row: (l, s, c) => `<row>${l}|${s}|${c}</row>`, sw: (on, a) => `<sw ${a} ${on ? 'on' : ''}>`, range: (a, v, lo, hi, step) => `<range ${a} value="${v}" min="${lo}" max="${hi}" step="${step}">` };
const x3 = (settings = {}) => ({ id: '40be', name: 'PRO X3 SUPERSTRIKE', kind: 'mouse', state: {}, controls: [80, 81, 82, 83, 86].map(cid => ({ cid })), config: { settings } });
const S = { menu: null, hitsSide: 'both', hitsField: null, onboard: {}, devices: [] };
Gaming.link(Object.assign({ S, wheelSettings: () => '<wheel>', chk: (on, a) => `<chk ${a} ${on ? 'on' : ''}>`, esc: x => String(x) }, html));

test('a PRO X3 SUPERSTRIKE is a gaming mouse with G HUB\'s pages, an MX mouse is not', () => {
  Core.link({ S: { devices: [] }, changed() {}, fx: {} });
  assert.equal(Core.provide.isGaming(x3()), true);
  assert.equal(Core.provide.isGaming({ id: 'b042' }), false);
  assert.deepEqual(Core.provide.devicePages(x3()), ['dpi', 'assignments', 'wheel', 'hits', 'info']);
  assert.deepEqual(Core.provide.navPages(x3()), ['dpi', 'assignments', 'wheel', 'hits']);
});

test('Sensitivity: five DPI slots with their values, the active one marked, both report rates', () => {
  const h = Gaming.provide.dpiSettings(x3({ dpi_slots: { 0: 400, 1: 800, 2: 1600 }, dpi_active: 2, dpi_default: 1, dpi_shift: 0, report_rate: 4000 }));
  assert.equal((h.match(/data-path="dpi_slots\.\d"/g) || []).length, 5);
  assert.match(h, new RegExp(`data-path="dpi_slots\\.2" data-out="dpi2" value="${posFromDpi(1600)}" min="0" max="1000"`));
  assert.match(h, /dpi-slot on [^>]*>[^]*?data-act="dpi-slot-active" data-key="2"/);   // slot 3 is the one in use
  assert.match(h, /data-act="dpi-input" data-key="2" data-axis="x"/);                     // its value can be typed
  assert.match(h, /<span class="num">2<\/span><span class="marks"><i class="fa-solid fa-crosshairs mk def"/);   // slot 2 is the default
  assert.match(h, /<span class="num">1<\/span><span class="marks"><i class="fa-solid fa-diamond mk shf"/);     // slot 1 the DPI shift
  assert.match(h, /data-path="report_rate" data-val="4000">4000/);   // wireless, chosen
  assert.match(h, /data-path="report_rate_wired"/);
  assert.match(h, /data-act="dpi-preset-menu"/);
  assert.match(h, /data-act="cal-open"/);
  assert.match(h, /data-act="dpi-test-open"/);
});

test('Sensitivity in X and Y: two values per slot, the lift-off distance in its menu, a preset of G HUB\'s shown by name', () => {
  const d = x3({ dpi_advanced: true, dpi_slots: { 0: 400 }, dpi_slots_y: { 0: 200 }, dpi_lod: { 0: 3 }, dpi_preset: 'first_person_xy' });
  let h = Gaming.provide.dpiSettings(d);
  assert.match(h, /data-key="0" data-axis="x"/);
  assert.match(h, /value="200" data-act="dpi-input" data-key="0" data-axis="y"/);
  assert.doesNotMatch(h, /data-act="dpi-lod"/);   // not in the row
  S.menu = 'dpi-slot:0'; h = Gaming.provide.dpiSettings(d); S.menu = null;
  assert.match(h, /class="on" data-act="dpi-lod" data-key="0" data-val="3"/);
  assert.match(h, /First person XY split/);
  assert.match(h, /pchg/);   // the slots differ from the preset's
});

test('HITS: each button or both, actuation 1..10, rapid trigger and its sensitivity, haptics 0..5', () => {
  S.hitsSide = 'both';
  let h = Gaming.provide.renderHitsPanel(x3());
  assert.match(h, /data-act="hits-val" data-key="actuation" data-out="h-actuation" value="5" min="1" max="10"/);
  assert.match(h, /data-act="hits-rt" >/);                            // the switch, off
  assert.match(h, /data-key="rapid_trigger" data-out="h-rapid_trigger" disabled value="2"/);   // its sensitivity waits for it
  assert.match(h, /data-key="haptics" data-out="h-haptics" value="3" min="0" max="5"/);
  S.hitsSide = 'right';
  h = Gaming.provide.renderHitsPanel(x3({ hits: { left: { actuation: 2 }, right: { actuation: 8, rapid_trigger_on: true, rapid_trigger: 4 } } }));
  assert.match(h, /data-key="actuation" data-out="h-actuation" value="8"/);
  assert.match(h, /data-key="rapid_trigger" data-out="h-rapid_trigger" value="4"/);
  const pic = Gaming.provide.pageHits(x3());
  assert.match(pic, /class="hb " data-act="hits-toggle" data-key="left"/);     // the left button is not being set
  assert.match(pic, /class="hb on" data-act="hits-toggle" data-key="right"/);  // the right one is, lit
  assert.match(h, /data-act="hits-code-open"/);
  assert.match(h, /data-act="hits-test-open"/);
  assert.match(h, /data-act="hits-reset"/);
  S.hitsSide = 'both';
});

test('Scroll wheel: the wheel pointing to BHOP, set in its panel in 100 ms steps; a plain note when the mouse has nothing', () => {
  assert.match(Gaming.provide.pageWheel(x3()), /Nothing to set/);
  const off = x3(); off.state = { bunny_hop: { enabled: false, timeout: null } };
  let h = Gaming.provide.pageWheel(off);
  assert.match(h, /data-act="wheel-open"/);
  assert.match(h, /BHOP mode<\/span><span>Off</);
  let p = Gaming.provide.renderWheelPanel(off);
  assert.match(p, /data-path="bunny_hop\.enabled" >/);
  assert.match(p, /data-path="bunny_hop\.timeout" data-out="bhop" disabled/);
  const on = x3({ bunny_hop: { enabled: true, timeout: 300 } }); on.state = { bunny_hop: { enabled: false } };
  h = Gaming.provide.pageWheel(on);
  assert.match(h, /BHOP mode<\/span><span>On</);
  assert.match(h, />300 ms</);
  p = Gaming.provide.renderWheelPanel(on);
  assert.match(p, /data-path="bunny_hop\.timeout" data-out="bhop" value="300" min="100" max="1000" step="100"/);
  const mx = x3(); mx.state = { hires: {} };
  assert.equal(Gaming.provide.pageWheel(mx), '<wheel>');
});

test('with the mouse connected: its own slot list and sensor DPI, only the rates it offers, its HITS values', () => {
  const d = x3({ dpi_active: 0 });
  d.state = { dpi: { dpi: 800, dpi_y: 800, slots: [800, 1200, 1600, 2400, 3200], levels: [100, 48000, 50] },
    report_rate: { report_rate: 1000, report_rate_wired: 1000, wireless: [125, 250, 500, 1000], wired: [125, 250, 500, 1000, 2000, 4000, 8000] },
    hits: { buttons: [{ actuation: 2, rapid_trigger: 3, rapid_trigger_on: true, haptics: 3 }] } };
  d.transport = 'lightspeed';
  let h = Gaming.provide.dpiSettings(d);
  assert.match(h, new RegExp(`data-path="dpi_slots\\.1" data-out="dpi1" value="${posFromDpi(1200)}" min="0" max="1000"`));
  assert.match(h, /The sensor is at 800 DPI/);
  assert.doesNotMatch(h, /data-path="report_rate" data-val="2000"/);   // not offered wirelessly
  assert.match(h, /data-path="report_rate_wired" data-val="8000"/);
  assert.match(h, /In use now/);
  S.hitsSide = 'left';
  h = Gaming.provide.renderHitsPanel(d);                                      // the values the mouse holds
  assert.match(h, /data-key="actuation" data-out="h-actuation" value="2"/);
  assert.match(h, /data-key="rapid_trigger" data-out="h-rapid_trigger" value="3"/);
  S.hitsSide = 'both';
});

test('the DPI slider runs on a log scale and comes back to the value it shows', () => {
  assert.equal(dpiFromPos(0), 100);
  assert.equal(dpiFromPos(1000), 48000);
  for (const v of [400, 800, 1200, 1600, 3200, 6400, 26000]) assert.ok(Math.abs(dpiFromPos(posFromDpi(v)) - v) / v < 0.01, `${v}`);
  assert.ok(posFromDpi(3200) > 500);   // the everyday values get more than half the slider
});

test('Settings for a gaming mouse: time left and power use, surface mode, onboard memory with its profiles', () => {
  const d = x3({ surface_mode: 'auto', report_rate: 1000, hits: { haptics: 3 } });
  d.battery = { percent: 72, charging: false };
  d.state = { surface_mode: 'on', onboard: { profiles: 5, current: 0 }, report_rate: { report_rate: 1000 } };
  let h = Gaming.provide.gamingBattery(d);
  assert.match(h, /About 141 hours/);
  assert.match(h, /4 mW \+ 4 mW/);
  S.onboard = { '40be': [{ index: 1, sector: 1, enabled: true, current: false, report_rate: 1000, slots: [{ x: 800, y: 800 }, { x: 1200, y: 600 }] }, { index: 2, sector: 2, enabled: false }] };
  h = Gaming.provide.gamingSettings(d);
  assert.match(h, /radio-row on" data-act="setting-val" data-path="surface_mode" data-val="auto"/);   // what NotLogi keeps wins over what was read
  assert.match(h, /data-act="onboard-memory"/);
  assert.match(h, /DPI 800 · 1200×600 · 1000 Hz/);
  assert.match(h, /data-act="onboard-pick" data-key="1" disabled/);   // onboard memory off: nothing to pick
  h = Gaming.provide.gamingSettings(x3({ onboard_memory: true, onboard_profile: 1 }));
  assert.equal(h, '');   // the mouse not read yet: no sections
});

test('the tools: HITS code with the code of the settings now, the latency test, calibration, the Sensitivity tool', () => {
  const d = x3({ hits: { left: { actuation: 2 } } });
  S.gtool = { kind: 'hits-code', input: '' };
  let h = Gaming.provide.renderGamingDialog(d);
  assert.match(h, new RegExp(Buffer.from('0002050202000303').toString('base64')));
  S.gtool.input = 'nonsense';
  assert.match(Gaming.provide.renderGamingDialog(d), /That is not a HITS code/);
  S.gtool.input = Buffer.from('0009090404110505').toString('base64');
  h = Gaming.provide.renderGamingDialog(d);
  assert.match(h, /Left: actuation 9, rapid trigger 4, haptics 5/);
  assert.match(h, /data-act="hits-code-apply" >/);   // enabled
  S.gtool = { kind: 'hits-test', side: 'left', phase: 'wait' };
  assert.match(Gaming.provide.renderGamingDialog(d), /ht-area wait" data-hits-area><span>Wait for blue/);
  S.gtool = { kind: 'hits-test', side: 'left', phase: 'done', result: { hits: 84, traditional: 99, diff: 15, saved: true, scale: [] } };
  h = Gaming.provide.renderGamingDialog(d);
  assert.match(h, /Time saved<\/span><span class="v">15 ms/);
  S.gtool = { kind: 'calibrate', step: 3, result: { test_dpi: 800, actual_dpi: 760, factor: 1.0526 }, name: 'MX Master 3S' };
  assert.match(Gaming.provide.renderGamingDialog(d), /\+5\.3%/);
  S.gtool = { kind: 'dpi-test', playing: true, n: 4, tx: 30, ty: 40 };
  assert.match(Gaming.provide.renderGamingDialog(d), /dt-target" style="left:30%;top:40%"[^]*4\/20/);
  S.gtool = null;
});

test('an app profile can give the gaming mouse a sensitivity of its own', () => {
  const d = x3({});
  d.config.profiles = { default: {}, game: { name: 'Game', match: ['game'], sensitivity: { id: 'first_person_xy', advanced: true, def: 1, shift: 0, slots: [{ x: 400, y: 200, on: true }, { x: 600, y: 400, on: true }, { x: 800, y: 600, on: false }] } } };
  let h = Gaming.provide.sensitivityRow(d, 'game');
  assert.match(h, /<option value="first_person_xy" selected>First person XY split<\/option>/);
  assert.match(h, /DPI 400×200 · 600×400</);   // the slots switched on
  assert.match(h, /ov-dot on/);
  h = Gaming.provide.sensitivityRow(d, 'default');
  assert.match(h, /Set on the Sensitivity page/);
});
