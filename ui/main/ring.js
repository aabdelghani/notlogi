// The action ring overlay: which ring opens (for the app in front), where, and running what is picked.
const { BrowserWindow, nativeTheme, globalShortcut, screen, ipcMain, Notification } = require('electron');
const plat = require('../platform');
const path = require('path');
const { execFile } = require('child_process');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder

// from the other parts of the main process, filled in by link()
let cursorPoint, loadUi, notify, offTaskbar, rpc;
exports.link = ctx => { ({ cursorPoint, loadUi, notify, offTaskbar, rpc } = ctx); };

// ------------------------------------------------------------- action ring
// Eight actions around the pointer, opened by the "Action ring" preset on any button or key.
// The window is a transparent square centred on the pointer; the page draws the wedges and
// reports the picked slot, and the action runs through the agent like any assignment would.
let ringRawMode = false;
       // window class of the focused application (the agent's 'app' event)
// the ring's settings are read the same way as in the settings window (shared/ring.mjs)
// the ring for the application in front: one set up for it, else the ring profile in use
const ringFor = rs => state.Ring.ringForApp(rs, state.currentApp);
const RING_SCALE = { small: 0.85, medium: 1, large: 1.2 };
// a slot by its place: [i] on the ring, [i, j] inside the folder at i
const ringSlotAt = path => state.Ring.slotAt(ringSlots, path);
// the device a ring action runs through: the one that opened it, else the first connected (so
// Easy-Switch works from Try it too)
const ringRunDevice = () => ringDevice || ((state.devices.find(d => d.online !== false) || state.devices[0] || {}).id) || null;
// adjustable actions: the wheel over them steps one way or the other
const RING_ADJUST = { brightness_up: ['brightness_up', 'brightness_down'], brightness_down: ['brightness_up', 'brightness_down'],
  zoom_in: ['zoom_in', 'zoom_out'], zoom_out: ['zoom_in', 'zoom_out'], next_track: ['next_track', 'prev_track'], prev_track: ['next_track', 'prev_track'] };
let ringWin = null, ringLoaded = null, ringSlots = [], ringTravel = 30, ringDevice = null, ringOpening = false, ringReleasedEarly = false, ringWarming = false;
let ringPending = [0, 0];   // movement that arrived while the ring was still being placed
const ringLog = [];          // how the last openings found the pointer, for the problem report
const RING_W = 560, RING_H = 460;   // the ring itself; the window grows to the screen when shown
function ensureRing() {
  if (ringWin && !ringWin.isDestroyed()) return ringWin;
  // A notification-type window: the window manager neither animates it in (a screen-sized
  // window zooming in looks like the whole screen twitching) nor gives it focus. Keys reach the
  // ring through global shortcuts held only while it is open.
  ringWin = new BrowserWindow({
    width: RING_W, height: RING_H, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false,
    focusable: false, type: plat.OVERLAY_TYPE,
    webPreferences: { preload: path.join(ROOT, 'preload-ring.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  ringWin.setAlwaysOnTop(true, 'pop-up-menu');
  // ready once its page has loaded: a ring shown before that stays empty (the first press on macOS)
  // (and again each time it loads anew, as when the language changes)
  const loading = () => { ringLoaded = new Promise(resolve => ringWin.webContents.once('did-finish-load', resolve)); };
  loading();
  ringWin.webContents.on('did-start-navigation', (_e, _url, inPlace, main) => { if (main && !inPlace) loading(); });
  ringWin.loadFile(path.join(ROOT, 'renderer', 'ring.html'));
  ringWin.on('hide', ringKeysOff);
  return ringWin;
}
// Hidden, the window keeps its last frame, and macOS shows that frame again on the next opening
// until the page has drawn the new ring: the old ring flashed, then the new one sprang out, as if
// it had opened twice. The page empties itself first, then the window goes.
let ringHideTimer = null;   // dropped by an opening that comes before it fires
function hideRing() {
  if (!ringWin || ringWin.isDestroyed() || !ringWin.isVisible()) return;
  ringKeysOff();
  ringWin.webContents.send('ring-clear');
  const w = ringWin;
  clearTimeout(ringHideTimer);
  ringHideTimer = setTimeout(() => { if (!w.isDestroyed() && !ringOpening) w.hide(); }, 40);
}
// The button that opened the ring was let go: the page runs the hovered slot, or stays open when
// the press was only a tap so the slot can be clicked.
// The ring belongs to the desktop, not to the app's own theme: light or dark, the accent colour
// and the interface font are read from the desktop's settings each time it opens.
const GNOME_ACCENTS = { blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800', orange: '#ed5b00', red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396' };
const YARU_ACCENTS = { '': '#e95420', bark: '#787859', sage: '#657b69', olive: '#4b8501', viridian: '#03875b', prussiangreen: '#308280', blue: '#0073e5', purple: '#7764d8', magenta: '#b34cb3', red: '#da3450' };
function gsetting(key) {
  // Electron renames the desktop in its own environment (Unity, for the tray), which makes gsettings
  // skip the distribution's per-desktop defaults such as Ubuntu's font and theme: ask as the real one
  const env = Object.assign({}, process.env, { XDG_CURRENT_DESKTOP: process.env.ORIGINAL_XDG_CURRENT_DESKTOP || process.env.XDG_CURRENT_DESKTOP || '' });
  return new Promise(resolve => execFile('gsettings', ['get', 'org.gnome.desktop.interface', key], { timeout: 700, env }, (err, out) => resolve(err ? '' : String(out).trim().replace(/^'|'$/g, ''))));
}
let lookCache = null, lookAt = 0;
async function systemLook() {
  if (!plat.IS_LINUX) return plat.systemLook();
  if (lookCache && Date.now() - lookAt < 4000) return lookCache;
  const [scheme, gtk, accentName, font] = await Promise.all(['color-scheme', 'gtk-theme', 'accent-color', 'font-name'].map(gsetting));
  const known = scheme || gtk;
  const dark = known ? /dark/i.test(scheme) || /-dark$/i.test(gtk) : nativeTheme.shouldUseDarkColors;
  let accent = GNOME_ACCENTS[accentName];
  if (!accent) { const m = /^Yaru(?:-([a-z]+?))?(?:-dark)?$/i.exec(gtk); if (m) accent = YARU_ACCENTS[(m[1] || '').toLowerCase()] || YARU_ACCENTS['']; }
  if (!accent) accent = GNOME_ACCENTS.blue;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16));
  const accentFg = (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1b1c1f' : '#ffffff';
  lookCache = { dark, accent, accentFg, font: font.replace(/\s+[\d.]+$/, '') };
  lookAt = Date.now();
  return lookCache;
}
// the displays the ring's window covers: all of them on Linux, where the pointer may not be known
// until it moves over the window; the one under the pointer on macOS and Windows. macOS gives each
// display its own Spaces (the default), and there a window spanning two shows on one only: the ring
// never opened on the second display.
const ringDisplays = pt => (plat.IS_LINUX ? screen.getAllDisplays() : [pt ? screen.getDisplayNearestPoint(pt) : screen.getPrimaryDisplay()]);
function ringArea(pt) {
  const all = ringDisplays(pt);
  const x = Math.min(...all.map(d => d.bounds.x)), y = Math.min(...all.map(d => d.bounds.y));
  return { x, y, width: Math.max(...all.map(d => d.bounds.x + d.bounds.width)) - x, height: Math.max(...all.map(d => d.bounds.y + d.bounds.height)) - y };
}
// A window's first showing is where desktops differ: one they have not seen yet is placed or sized
// by them (GNOME on Wayland, macOS with several displays), and only later showings land where
// asked. People saw it as a ring that misses the pointer the first time and is right the second.
// So the first showing happens here, at startup: empty, see-through, letting clicks through, and
// gone again at once.
function warmRing() {
  const w = ensureRing();
  const go = () => {
    if (w.isDestroyed() || w.isVisible() || ringOpening) return;
    ringWarming = true;
    try { w.setOpacity(0); } catch (e) {}
    w.setIgnoreMouseEvents(true);
    w.setBounds(ringArea());
    w.show(); offTaskbar(w);
    setTimeout(() => { if (!w.isDestroyed() && ringWarming) w.setBounds(ringArea()); }, 60);
    setTimeout(() => {
      if (w.isDestroyed()) return;
      const mine = ringWarming;   // a real opening in the meantime took the window over
      ringWarming = false;
      if (mine) w.hide();
      w.setIgnoreMouseEvents(false);
      try { w.setOpacity(1); } catch (e) {}
    }, 200);
  };
  ringLoaded.then(go);
}
function releaseRing() {
  if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) ringWin.webContents.send('ring-release');
  else if (ringOpening) ringReleasedEarly = true;   // let go before the ring was even placed: a tap
}
// Esc closes and 1 to 8 pick while the ring is open; the window itself never has the focus
const RING_KEYS = ['Escape', '1', '2', '3', '4', '5', '6', '7', '8'];
function ringKeysOn() {
  for (const k of RING_KEYS) {
    try { globalShortcut.register(k, () => { if (!ringWin || ringWin.isDestroyed() || !ringWin.isVisible()) return; ringWin.webContents.send('ring-key', { key: k }); }); } catch (e) {}
  }
}
function ringKeysOff() { for (const k of RING_KEYS) { try { globalShortcut.unregister(k); } catch (e) {} } }
// Raw movement from the held button: it steers the ring while the pointer stays put.
function moveRing(dx, dy) {
  if (ringWin && !ringWin.isDestroyed() && ringWin.isVisible()) ringWin.webContents.send('ring-move', { dx, dy });
  else if (ringOpening) { ringPending[0] += dx; ringPending[1] += dy; }
}
async function showRing(deviceId, raw) {
  const w = ensureRing();
  if (ringWarming) { ringWarming = false; w.setIgnoreMouseEvents(false); try { w.setOpacity(1); } catch (e) {} }   // the startup showing is still up: this opening takes over
  else if (w.isVisible()) { hideRing(); return; }
  if (ringOpening) return;
  state.uiSettings = state.uiSettings || loadUi();
  ringDevice = typeof deviceId === 'string' ? deviceId : null;
  const rs = (state.general || {}).ring || {};   // kept fresh by refreshGeneral, no round trip here
  const pick = ringFor(rs);
  ringSlots = pick.slots;
  ringRawMode = !!raw;
  ringTravel = rs.travel || 30;
  if (rs.free_pointer) raw = false;   // the pointer stays free: the ring follows it instead of taking the mouse
  ringOpening = true; ringReleasedEarly = false; ringPending = [0, 0];
  const [pt, look] = await Promise.all([cursorPoint(), systemLook()]);
  // The window covers the displays (see ringDisplays) and the page draws the ring where the pointer is. A window
  // cannot be placed at the pointer on Wayland (the compositor puts it where it likes, usually the
  // middle of the screen), and there the pointer's position is not even known until it moves over
  // the window; the page waits for that first movement. On X11 the position is known up front.
  const area = ringArea(pt);
  const X = area.x, Y = area.y, R = area.x + area.width, Bm = area.y + area.height;
  const known = !plat.IS_LINUX || (process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'x11';
  const at = known ? { x: pt.x - X, y: pt.y - Y } : null;
  const guess = { x: pt.x - X, y: pt.y - Y };
  const place = () => { if (w.isDestroyed()) return; const b = w.getBounds(); if (b.x !== X || b.y !== Y || b.width !== R - X || b.height !== Bm - Y) w.setBounds({ x: X, y: Y, width: R - X, height: Bm - Y }); };
  const send = () => {
    clearTimeout(ringHideTimer);
    place(); w.show(); offTaskbar(w); ringKeysOn();
    setTimeout(place, 60);   // once, in case the window manager moved it
    // macOS and Windows know the pointer exactly: the ring is centred on it even at a screen edge, part of
    // it off screen if need be. Linux keeps the ring fully on screen, since on Wayland its place is a guess.
    w.webContents.send('ring-show', { look, slots: ringSlots, travel: ringTravel, raw: !!raw, at, guess, size: { w: R - X, h: Bm - Y }, scale: RING_SCALE[rs.size] || 1, keepOn: plat.IS_LINUX });
    ringOpening = false;
    if (ringPending[0] || ringPending[1]) w.webContents.send('ring-move', { dx: ringPending[0], dy: ringPending[1] });
    if (ringReleasedEarly) { ringReleasedEarly = false; w.webContents.send('ring-release'); }
    // whether the compositor kept the size asked for (a Wayland compositor may shrink or move it)
    setTimeout(() => { if (w.isDestroyed()) return; const b = w.getBounds(), c = w.getContentBounds(); ringLog.push({ when: new Date().toISOString().slice(11, 19), raw: ringRawMode, how: 'window', ms: 250, x: b.x, y: b.y, size: `${b.width}x${b.height} (asked ${R - X}x${Bm - Y}, content ${c.width}x${c.height})` }); if (ringLog.length > 10) ringLog.shift(); }, 250);
  };
  ringLoaded.then(send);
}
ipcMain.on('ring-close', hideRing);
ipcMain.on('ring-diag', (_e, info) => { ringLog.push(Object.assign({ when: new Date().toISOString().slice(11, 19), raw: ringRawMode }, info)); if (ringLog.length > 10) ringLog.shift(); });
// haptic feedback on the mouse that opened the ring; mice without it, and rings opened from the
// page, simply get none
const ringCue = cue => { if (ringDevice) rpc('haptic_cue', { id: ringDevice, cue }).catch(() => {}); };
ipcMain.on('ring-hover', () => ringCue('ring_hover'));
ipcMain.on('ring-pick', async (_e, { index, path }) => {
  const slot = ringSlotAt(path || [index]);
  if (!slot || !slot.action) return;
  // Next ring profile: the ring stays open and shows the next profile's actions
  if (slot.action.type === 'ring_profile') {
    const rs = Object.assign({}, state.general.ring || {}), n = Array.isArray(rs.profiles) ? rs.profiles.length : 0;
    if (n < 2) return;
    rs.active = ((rs.active || 0) + 1) % n;
    state.Ring.finishRing(rs);
    try { state.general = await rpc('set_general', { ring: rs }); } catch (e) { return; }
    ringSlots = rs.profiles[rs.active].slots || [];
    ringCue('ring_run');
    if (ringWin && !ringWin.isDestroyed()) ringWin.webContents.send('ring-slots', { slots: ringSlots, name: rs.profiles[rs.active].name });
    notify('agent-event', { event: 'general', data: state.general });
    return;
  }
  if (slot.action.type === 'folder' || slot.action.type === 'brightness_dial') return;   // the overlay opens folders and runs the brightness dial itself
  hideRing();
  ringCue('ring_run');
  const params = { action: slot.action };
  const runOn = ringRunDevice();
  if (runOn) params.id = runOn;
  try { await rpc('run_action', params); }
  catch (e) { if (Notification.isSupported()) new Notification({ title: 'Action ring', body: `${slot.label || 'Action'} did not run: ${e.message}` }).show(); }
});
ipcMain.handle('ring-show', () => showRing(null, false));
// the wheel over an adjustable slot: one step of it each notch, the ring staying open
ipcMain.on('ring-adjust', (_e, { path, dir }) => {
  const slot = ringSlotAt(path || []);
  if (!slot) return;
  const key = typeof slot.action === 'string' ? slot.action : slot.action && slot.action.preset;
  const pair = RING_ADJUST[key];
  if (!pair) return;
  const params = { action: pair[dir > 0 ? 0 : 1] }, runOn = ringRunDevice();
  if (runOn) params.id = runOn;
  rpc('run_action', params).catch(() => {});
});

// the ring window as it is now, for the problem report
const ringState = () => !ringWin ? 'not made' : ringWin.isDestroyed() ? 'destroyed' : `${ringWin.isVisible() ? 'shown' : 'hidden'}${ringWarming ? ', warming up' : ''}${ringOpening ? ', opening' : ''}, ${ringWin.getBounds().width}x${ringWin.getBounds().height} at (${ringWin.getBounds().x}, ${ringWin.getBounds().y})`;
exports.provide = { ringFor, RING_SCALE, ringSlotAt, ringRunDevice, RING_ADJUST, ringLog, ringState, RING_W, RING_H, ensureRing, warmRing, GNOME_ACCENTS, YARU_ACCENTS, gsetting, systemLook, releaseRing, RING_KEYS, ringKeysOn, ringKeysOff, moveRing, showRing, ringCue };
