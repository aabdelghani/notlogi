import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../shared/gaming.mjs';

test('G HUB\'s eleven curated presets, each with five slots and its default and shift slots', () => {
  assert.equal(G.DPI_PRESETS.length, 11);
  for (const p of G.DPI_PRESETS) {
    assert.equal(p.slots.length, 5, p.id);
    assert.ok(p.slots[p.def].on && p.slots[p.shift].on, p.id);
    if (!p.advanced) assert.ok(p.slots.every(s => s.x === s.y), p.id);
  }
  const fp = G.DPI_PRESETS.find(p => p.id === 'first_person_xy');
  assert.deepEqual(fp.slots[0], { x: 400, y: 200, lod: 2, on: true });
  assert.equal(fp.def, 1);   // G HUB's defaultIndex 2, counted from 1
});

test('choosing a preset writes every slot, the views and slots it names, and starts on its default slot', () => {
  const items = G.presetItems(G.DPI_PRESETS.find(p => p.id === 'third_person'));
  const v = path => (items.find(i => i.path.join('.') === path) || {}).value;
  assert.equal(v('dpi_slots.3'), 1600);
  assert.equal(v('dpi_enabled.4'), false);
  assert.equal(v('dpi_active'), 1);
  assert.equal(v('dpi_preset'), 'third_person');
  assert.equal(items.length, 5 * 4 + 5);
});

test('the slots as set now, and whether they still match their preset', () => {
  const p = G.DPI_PRESETS[1];
  const s = {};
  for (const i of G.presetItems(p)) { let o = s; i.path.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; }); o[i.path.at(-1)] = i.value; }
  assert.deepEqual(G.currentSlots(s), p.slots);
  assert.ok(G.presetMatches(p, s, {}));
  s.dpi_slots['2'] = 1700;
  assert.ok(!G.presetMatches(p, s, {}));
  // nothing kept yet: the sensor's own slots, else the mouse's defaults
  assert.equal(G.currentSlots({}, { dpi: { slots: [1500, 1900] } })[1].x, 1900);
  assert.equal(G.currentSlots({})[4].x, 3200);
});

test('HITS: a button\'s own values, else those for both, else the mouse\'s, else G HUB\'s defaults', () => {
  const st = { hits: { buttons: [{ actuation: 7, rapid_trigger: 4, rapid_trigger_on: true, haptics: 1 }, {}] } };
  assert.deepEqual(G.hitsOf({}, st, 'left'), { actuation: 7, rapid_trigger: 4, rapid_trigger_on: true, haptics: 1 });
  assert.deepEqual(G.hitsOf({}, {}, 'right'), G.HITS_DEFAULT);
  const s = { hits: { actuation: 3, haptics: 2, right: { actuation: 9 } } };
  assert.equal(G.hitsOf(s, st, 'left').actuation, 3);
  assert.equal(G.hitsOf(s, st, 'right').actuation, 9);
  assert.equal(G.hitsOf(s, st, 'right').haptics, 2);
  assert.deepEqual(G.hitsItems({ haptics: 4 }, ['right']), [{ path: ['hits', 'right', 'haptics'], value: 4 }]);
});

test('HITS code: G HUB\'s 16 digits in Base64, read back, and the plain digits taken too', () => {
  const code = G.hitsCode(G.HITS_DEFAULT, G.HITS_DEFAULT);
  assert.equal(Buffer.from(code, 'base64').toString(), '0005050202000303');
  const left = { actuation: 2, rapid_trigger: 3, rapid_trigger_on: true, haptics: 3 }, right = { actuation: 2, rapid_trigger: 2, rapid_trigger_on: true, haptics: 3 };
  const back = G.parseHitsCode(G.hitsCode(left, right));
  assert.deepEqual([back.left, back.right], [left, right]);
  assert.deepEqual(G.parseHitsCode('0002020302110303').left, left);
  assert.equal(G.parseHitsCode('0011050202000303'), null);   // actuation 11 is out of range
  assert.equal(G.parseHitsCode('hello'), null);
  assert.equal(G.parseHitsCode(''), null);
});

test('HITS latency as G HUB works it out: the chosen step against step 5', () => {
  const times = { 1: 80, 2: 84, 3: 88, 4: 93, 5: 99, 6: 106, 7: 114, 8: 123, 9: 133, 10: 144 };
  const r = G.hitsLatency(times, 2);
  assert.equal(r.hits, 84); assert.equal(r.traditional, 99); assert.equal(r.diff, 15); assert.ok(r.saved);
  assert.ok(G.hitsLatency(times, 8).diff < 0);
  assert.equal(G.hitsLatency({ 1: 70, 2: 75 }, 2).diff, Infinity);   // never reached step 5
});

test('power and battery as G HUB shows them: 4 + 4 mW at 1000 Hz, about 141 hours at 72 %', () => {
  const p = G.powerUse({ rate: 1000, haptics: 3 });
  assert.equal(Math.round(p.system), 4);
  assert.equal(Math.round(p.report), 4);
  assert.equal(Math.round(G.batteryHours(72, { rate: 1000, haptics: 3 })), 141);
  assert.ok(G.batteryHours(72, { rate: 8000, haptics: 3 }) < 40);
  assert.equal(G.batteryHours(undefined), null);
});

test('new ids and free names', () => {
  assert.equal(G.freeName('Custom preset', ['Custom preset', 'Custom preset 2']), 'Custom preset 3');
  assert.ok(!['a'].includes(G.newId('p', ['a'])));
});
