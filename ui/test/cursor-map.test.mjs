import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMonitorAt, matchDisplay, mapCompositorPoint } from '../shared/cursor-map.mjs';

// the layout the user of this port actually runs: a 2560x1440 at 1.15 next to
// a 1920x1080 at 1.0, as KWin sees it (logical) and as Electron under XWayland
// sees the same two screens
const kwin = [
  { name: 'DP-1', x: 1920, y: 0, w: 2227, h: 1253 },   // right, scaled 1.15
  { name: 'DP-2', x: 0, y: 173, w: 1920, h: 1080 },    // left, 1.0
];
const electronX11 = [
  { label: 'DP-2', bounds: { x: 0, y: 172, width: 1910, height: 1075 } },
  { label: 'DP-1', bounds: { x: 1909, y: 0, width: 2215, height: 1246 } },
];

test('the monitor containing the point is picked', () => {
  assert.equal(pickMonitorAt({ x: 2500, y: 600 }, kwin).name, 'DP-1');
  assert.equal(pickMonitorAt({ x: 100, y: 500 }, kwin).name, 'DP-2');
});

test('a point between monitors falls back to the nearest centre', () => {
  assert.ok(pickMonitorAt({ x: 1918, y: 600 }, kwin));
});

test('a compositor monitor finds its display by connector name', () => {
  assert.equal(matchDisplay(kwin[0], electronX11).label, 'DP-1');
  assert.equal(matchDisplay(kwin[1], electronX11).label, 'DP-2');
});

test('without names the displays still match by overlap', () => {
  const anon = electronX11.map(d => ({ label: '', bounds: d.bounds }));
  assert.equal(matchDisplay(kwin[0], anon).bounds.width, 2215);
});

test('the logical cursor maps fractionally onto the matching display', () => {
  // the centre of KWin's DP-1 is the centre of Electron's DP-1
  const c = mapCompositorPoint({ x: 1920 + 2227 / 2, y: 1253 / 2 }, kwin, electronX11);
  assert.equal(c.x, 1909 + Math.round(2215 / 2));
  assert.equal(c.y, Math.round(1246 / 2));
});

test('mixed scales: the same physical point lands on the pointer', () => {
  // a third of the way into KWin's DP-1 is a third of the way into Electron's
  const p = mapCompositorPoint({ x: 1920 + 2227 / 3, y: 400 }, kwin, electronX11);
  assert.equal(p.x, 1909 + Math.round(2215 / 3));
  // and a quarter into DP-2 likewise
  const q = mapCompositorPoint({ x: 1920 / 4, y: 173 + 300 }, kwin, electronX11);
  assert.equal(q.x, Math.round(1910 / 4));
});

test('identical layouts map to themselves (identity at 100%)', () => {
  const same = [{ name: 'eDP-1', x: 0, y: 0, w: 1920, h: 1080 }];
  const p = mapCompositorPoint({ x: 500, y: 400 }, same, [{ label: 'eDP-1', bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]);
  assert.deepEqual(p, { x: 500, y: 400 });
});

test('points outside every monitor are clamped inside the nearest', () => {
  const p = mapCompositorPoint({ x: -50, y: -50 }, kwin, electronX11);
  assert.ok(p.x >= 0 && p.y >= 0);
});

test('no monitors means no answer, not a crash', () => {
  assert.equal(mapCompositorPoint({ x: 1, y: 1 }, [], electronX11), null);
  assert.equal(mapCompositorPoint({ x: 1, y: 1 }, null, electronX11), null);
});
