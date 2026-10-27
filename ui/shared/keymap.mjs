// A keyboard photo made by its owner: the photo, and where each key the keyboard reports sits on it.
// It is kept as a device file (one JSON with the photo inside) that can be shared and imported,
// and drawn like the photos that come with NotLogi.

export const FORMAT = 'notlogi-device';
export const VERSION = 1;
const MAX_SIDE = 8000;
const PHOTO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const ID = /^[0-9a-f]{4}$/;

// a key's size before it is changed: about a 26th of the photo's width, three quarters as tall
export const keySize = w => { const kw = Math.max(8, Math.round(w / 26)); return { kw, kh: Math.round(kw * 0.75) }; };

// The keys to place, in the order the keyboard reports them (the F row first, as it is printed),
// then its Easy-Switch keys when it has them.
export function keysToPlace(controls, hosts) {
  const keys = (controls || []).filter(c => c.divertable !== false)
    .sort((a, b) => (b.fkey ? 1 : 0) - (a.fkey ? 1 : 0) || (a.position || 0) - (b.position || 0))
    .map(c => ({ cid: c.cid, label: c.label || String(c.cid) }));
  const n = hosts && hosts.count ? Math.min(3, hosts.count) : 0;
  return keys.concat(Array.from({ length: n }, (_, i) => ({ host: i })));
}
const same = (a, b) => (a.host !== undefined ? a.host === b.host : a.cid === b.cid);
const placed = (m, k) => k.host !== undefined ? m.hosts.some(h => h[0] === k.host) : m.spots.some(s => s[0] === k.cid);

// A map being made: from a new photo, or from a device file to change
export function startMap({ id, name, photo, keys, from }) {
  const f = from || null;
  return {
    ids: f ? f.ids : [id], name: f ? f.name : name, src: f ? f.photo.src : photo.src,
    w: f ? f.photo.w : photo.w, h: f ? f.photo.h : photo.h,
    ...(f ? { kw: f.key.w, kh: f.key.h } : keySize(photo.w)),
    spots: f ? f.spots.map(s => s.slice()) : [], hosts: f ? (f.hosts || []).map(h => h.slice()) : [],
    keys, skipped: [], again: null,
  };
}
// the key to click next: one chosen to place again, else the first neither placed nor skipped
export function nextKey(m) {
  if (m.again) return m.again;
  return m.keys.find(k => !placed(m, k) && !m.skipped.some(s => same(s, k))) || null;
}
export const placedCount = m => m.keys.filter(k => placed(m, k)).length;
// a click on the photo, in photo pixels: the next key goes there
export function place(m, x, y) {
  const k = nextKey(m); if (!k) return m;
  const at = [Math.round(Math.max(0, Math.min(m.w, x))), Math.round(Math.max(0, Math.min(m.h, y)))];
  const n = { ...m, again: null, skipped: m.skipped.filter(s => !same(s, k)) };
  if (k.host !== undefined) n.hosts = m.hosts.filter(h => h[0] !== k.host).concat([[k.host, ...at]]);
  else n.spots = m.spots.filter(s => s[0] !== k.cid).concat([[k.cid, ...at]]);
  n.last = k;
  return n;
}
export const skip = m => { const k = nextKey(m); return k ? { ...m, again: null, skipped: m.skipped.concat([k]) } : m; };
// the last key placed comes off the photo and is the next to click
export function undo(m) {
  const k = m.last; if (!k) return m;
  return { ...m, last: null, again: k, spots: k.host !== undefined ? m.spots : m.spots.filter(s => s[0] !== k.cid), hosts: k.host !== undefined ? m.hosts.filter(h => h[0] !== k.host) : m.hosts };
}
export const again = (m, k) => ({ ...m, again: m.keys.find(x => same(x, k)) || null });
export const resize = (m, kw) => { const w = Math.max(8, Math.min(Math.round(m.w / 4), Math.round(kw))); return { ...m, kw: w, kh: Math.round(w * 0.75) }; };

// the device file of a finished map
export const toFile = m => ({
  format: FORMAT, version: VERSION, kind: 'keyboard', ids: m.ids, name: m.name,
  photo: { src: m.src, w: m.w, h: m.h }, key: { w: m.kw, h: m.kh }, spots: m.spots, hosts: m.hosts,
});
// what the keyboard pages draw, shaped like the photos NotLogi comes with
export const toEntry = f => ({ src: f.photo.src, w: f.photo.w, h: f.photo.h, kw: f.key.w, kh: f.key.h, spots: f.spots, ...(f.hosts && f.hosts.length === 3 ? { hosts: f.hosts } : {}), own: true });

// A device file read from disk or shared by someone: the file, cleaned, or null when it is not one
export function readFile(o) {
  if (!o || typeof o !== 'object' || o.format !== FORMAT || o.version !== VERSION || o.kind !== 'keyboard') return null;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const ids = Array.isArray(o.ids) ? o.ids.map(x => String(x).toLowerCase()) : [];
  const p = o.photo || {}, k = o.key || {};
  if (!ids.length || !ids.every(x => ID.test(x)) || typeof p.src !== 'string' || !PHOTO.test(p.src) || !int(p.w, 1, MAX_SIDE) || !int(p.h, 1, MAX_SIDE)) return null;
  if (!int(k.w, 1, p.w) || !int(k.h, 1, p.h) || !Array.isArray(o.spots)) return null;
  const inside = s => Array.isArray(s) && s.length >= 3 && s.length <= 6 && s.every(v => Number.isInteger(v)) && s[1] >= 0 && s[1] <= p.w && s[2] >= 0 && s[2] <= p.h;
  if (!o.spots.every(s => inside(s) && s[0] >= 0 && s[0] <= 0xFFFF)) return null;
  const hosts = Array.isArray(o.hosts) ? o.hosts : [];
  if (!hosts.every(h => inside(h) && h.length === 3 && h[0] >= 0 && h[0] <= 2)) return null;
  return { format: FORMAT, version: VERSION, kind: 'keyboard', ids, name: String(o.name || '').slice(0, 80), photo: { src: p.src, w: p.w, h: p.h }, key: { w: k.w, h: k.h }, spots: o.spots, hosts };
}
