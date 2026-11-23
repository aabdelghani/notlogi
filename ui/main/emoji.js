// The emoji picker window opened by the Emoji key.
const { BrowserWindow, app, screen, ipcMain, clipboard, Notification } = require('electron');
const path = require('path');
const plat = require('../platform');
const { execFile } = require('child_process');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder
const t = (s, v) => (state.I18n ? state.I18n.t(s, v) : s);

// from the other parts of the main process, filled in by link()
let loadUi, offTaskbar, rpc, saveUi;
exports.link = ctx => { ({ loadUi, offTaskbar, rpc, saveUi } = ctx); };

// ------------------------------------------------------------- emoji picker

const EMOJI_W = 380, EMOJI_H = 460;
function ensureEmoji() {
  if (state.emojiWin && !state.emojiWin.isDestroyed()) return state.emojiWin;
  state.emojiWin = new BrowserWindow({
    width: EMOJI_W, height: EMOJI_H, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload-emoji.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  state.emojiWin.setAlwaysOnTop(true, 'pop-up-menu');
  state.emojiWin.loadFile(path.join(ROOT, 'renderer', 'emoji.html'));
  state.emojiWin.on('blur', () => { if (state.emojiWin && !state.emojiWin.isDestroyed() && state.emojiWin.isVisible()) state.emojiWin.hide(); });
  return state.emojiWin;
}
// Electron's getCursorScreenPoint() goes stale on X11 while no Electron window has the pointer,
// so ask the X server directly when we can.
function cursorPoint() {
  return new Promise(resolve => {
    const fallback = () => resolve(screen.getCursorScreenPoint());
    // macOS: the window server's live position from the agent; Electron's own reading can be stale
    if (plat.IS_MAC && rpc) return rpc('pointer', {}).then(p => p && typeof p.x === 'number' ? resolve({ x: Math.round(p.x), y: Math.round(p.y) }) : fallback()).catch(fallback);
    if (!plat.IS_LINUX) return fallback();
    // xdotool asks the X server, and its answer is in the X screen's coordinates: the app's own
    // only when Electron itself runs on X11. In a Wayland session XWayland is up as well (DISPLAY
    // set), but its screen is stretched where the displays' scales differ, and a point taken from
    // it lands away from the pointer a Wayland window is drawn to.
    if ((process.env.XDG_SESSION_TYPE || '').toLowerCase() !== 'x11' && app.commandLine.getSwitchValue('ozone-platform') !== 'x11') return fallback();
    execFile('xdotool', ['getmouselocation', '--shell'], { timeout: 500 }, (err, out) => {
      if (err) return fallback();
      const m = /X=(-?\d+)\s+Y=(-?\d+)/.exec(String(out));
      if (!m) return fallback();
      resolve({ x: Number(m[1]), y: Number(m[2]) });
    });
  });
}
async function showEmoji(source) {
  const w = ensureEmoji();
  if (w.isVisible()) { w.hide(); return; }
  state.uiSettings = state.uiSettings || loadUi();
  const pt = await cursorPoint();
  const a = screen.getDisplayNearestPoint(pt).workArea;
  const x = Math.max(a.x, Math.min(a.x + a.width - EMOJI_W, pt.x - EMOJI_W / 2));
  const y = Math.max(a.y, Math.min(a.y + a.height - EMOJI_H, pt.y + 24));
  const X = Math.round(x), Y = Math.round(y);
  const place = () => { if (w.isDestroyed()) return; const [cx, cy] = w.getPosition(); if (cx !== X || cy !== Y) w.setPosition(X, Y); };
  const send = () => {
    w.setPosition(X, Y); w.show(); offTaskbar(w); place(); w.focus();
    setTimeout(place, 40); setTimeout(place, 160);   // the window manager may re-place a freshly mapped window
    w.webContents.send('emoji-show', { theme: state.uiSettings.theme || 'light', recent: state.uiSettings.emojiRecent || [], source: source || t('Emoji key') });
  };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
}
ipcMain.on('emoji-close', () => { if (state.emojiWin && !state.emojiWin.isDestroyed()) state.emojiWin.hide(); });
ipcMain.on('emoji-pick', async (_e, { ch }) => {
  if (state.emojiWin && !state.emojiWin.isDestroyed()) state.emojiWin.hide();
  state.uiSettings = state.uiSettings || loadUi();
  state.uiSettings.emojiRecent = [ch].concat((state.uiSettings.emojiRecent || []).filter(x => x !== ch)).slice(0, 16);
  saveUi(state.uiSettings);
  const previous = clipboard.readText();
  clipboard.writeText(ch);
  await new Promise(r => setTimeout(r, 120));   // let focus return to the previous window
  try { await rpc('play_action', { action: { type: 'keystroke', keys: plat.PASTE_KEYS } }); }
  catch (e) { if (Notification.isSupported()) new Notification({ title: t('Emoji copied'), body: t('{emoji} is on the clipboard (agent not reachable to paste)', { emoji: ch }), icon: path.join(ROOT, 'assets', 'icon.png') }).show(); }
  setTimeout(() => { try { if (clipboard.readText() === ch && previous) clipboard.writeText(previous); } catch (e) {} }, 800);
});
ipcMain.handle('emoji-show', () => showEmoji(t('Preview')));

exports.provide = { EMOJI_W, EMOJI_H, ensureEmoji, cursorPoint, showEmoji };
