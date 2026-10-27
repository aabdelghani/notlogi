import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../shared/keymap.mjs';

const controls = [
  { cid: 10, label: 'Calculator', fkey: false, position: 0, divertable: true },
  { cid: 200, label: 'Brightness up', fkey: true, position: 2, divertable: true },
  { cid: 199, label: 'Brightness down', fkey: true, position: 1, divertable: true },
  { cid: 300, label: 'Fixed', fkey: false, position: 0, divertable: false },
];
const photo = { src: 'data:image/png;base64,AAAA', w: 2600, h: 800 };
const fresh = () => K.startMap({ id: 'b36f', name: 'Signature K650', photo, keys: K.keysToPlace(controls, { count: 3 }) });

test('the keys to place: the F row in its printed order, the rest after, then the Easy-Switch keys', () => {
  const keys = K.keysToPlace(controls, { count: 3 });
  assert.deepEqual(keys.map(k => k.cid ?? 'h' + k.host), [199, 200, 10, 'h0', 'h1', 'h2']);
  assert.equal(K.keysToPlace(controls, null).length, 3);   // no Easy-Switch, and keys it cannot set are left out
});

test('a click places the key asked for, and the next one is asked for', () => {
  let m = fresh();
  assert.equal(K.nextKey(m).cid, 199);
  m = K.place(m, 288.4, 142.6);
  assert.deepEqual(m.spots, [[199, 288, 143]]);
  assert.equal(K.nextKey(m).cid, 200);
  m = K.place(m, -40, 9999);   // clicks past the edge land on it
  assert.deepEqual(m.spots[1], [200, 0, 800]);
  assert.equal(K.placedCount(m), 2);
});

test('skip, undo and placing a key again', () => {
  let m = fresh();
  m = K.skip(m);
  assert.equal(K.nextKey(m).cid, 200);
  m = K.place(m, 10, 10);
  m = K.undo(m);
  assert.equal(m.spots.length, 0);
  assert.equal(K.nextKey(m).cid, 200);   // the key undone is asked for again
  m = K.place(m, 10, 10); m = K.place(m, 20, 20);
  m = K.again(m, { cid: 200 });
  assert.equal(K.nextKey(m).cid, 200);
  m = K.place(m, 50, 60);
  assert.deepEqual(m.spots.find(s => s[0] === 200), [200, 50, 60]);
  assert.equal(m.spots.length, 2);
  // Easy-Switch keys are kept apart from the keys
  m = K.place(m, 1800, 145);
  assert.deepEqual(m.hosts, [[0, 1800, 145]]);
});

test('the key size starts from the photo and stays within it', () => {
  const m = fresh();
  assert.deepEqual([m.kw, m.kh], [100, 75]);
  assert.deepEqual([K.resize(m, 3).kw, K.resize(m, 99999).kw], [8, 650]);
});

test('a device file round trip, and what the pages draw from it', () => {
  let m = fresh();
  for (let i = 0; i < 6; i++) m = K.place(m, 100 + i * 100, 140);
  const f = K.readFile(JSON.parse(JSON.stringify(K.toFile(m))));
  assert.ok(f);
  assert.deepEqual(f.ids, ['b36f']);
  assert.equal(f.spots.length, 3);
  const e = K.toEntry(f);
  assert.deepEqual([e.w, e.h, e.kw, e.kh, e.own], [2600, 800, 100, 75, true]);
  assert.equal(e.hosts.length, 3);   // all three Easy-Switch keys placed: the Easy-Switch page can use them
  assert.equal(K.toEntry({ ...f, hosts: f.hosts.slice(0, 2) }).hosts, undefined);
});

test('files that are not device files are refused', () => {
  const good = K.toFile(K.place(fresh(), 10, 10));
  assert.ok(K.readFile(good));
  const bad = [
    null, 'x', {}, { ...good, format: 'other' }, { ...good, version: 2 }, { ...good, ids: [] }, { ...good, ids: ['zz'] },
    { ...good, photo: { ...good.photo, src: 'https://example.com/a.png' } }, { ...good, photo: { ...good.photo, src: 'data:text/html;base64,AAAA' } },
    { ...good, photo: { ...good.photo, w: 0 } }, { ...good, spots: [[199, 99999, 10]] }, { ...good, spots: [['a', 1, 1]] },
    { ...good, hosts: [[5, 1, 1]] },
  ];
  for (const b of bad) assert.equal(K.readFile(b), null, JSON.stringify(b).slice(0, 80));
  assert.deepEqual(K.readFile({ ...good, ids: ['B36F'] }).ids, ['b36f']);
});
