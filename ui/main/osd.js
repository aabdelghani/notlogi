// On-screen notices (mic, SmartShift, backlight, host, DPI) when a device changes them.
const { BrowserWindow, screen, ipcMain } = require('electron');
const plat = require('../platform');
const path = require('path');
const { execFile } = require('child_process');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder
const t = (s, v) => (state.I18n ? state.I18n.t(s, v) : s);

// from the other parts of the main process, filled in by link()
let rpc, showEmoji;
exports.link = ctx => { ({ rpc, showEmoji } = ctx); };

let osdWin = null;
let osdTimer = null;

// --------------------------------------------------------------------- OSD
function osdEnabled(kind) {
  if (state.general.osd_enabled === false) return false;
  const ev = Object.assign({ mic: true, smartshift: true, backlight: true, host: true, dpi: true, battery: true, onboard_profile: true }, state.general.osd_events || {});
  return ev[kind] !== false;
}
function ensureOsd() {
  if (osdWin && !osdWin.isDestroyed()) return osdWin;
  osdWin = new BrowserWindow({
    width: 460, height: 90, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: false, resizable: false,
    hasShadow: false, show: false, type: plat.OVERLAY_TYPE,
    webPreferences: { preload: path.join(ROOT, 'preload-osd.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  osdWin.setIgnoreMouseEvents(true);
  osdWin.setAlwaysOnTop(true, 'screen-saver');
  osdWin.loadFile(path.join(ROOT, 'renderer', 'osd.html'));
  return osdWin;
}
function positionOsd() {
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const a = disp.workArea;
  const pos = state.general.osd_position || 'bottom';
  const x = Math.round(a.x + (a.width - 460) / 2);
  const y = pos === 'top' ? a.y + 40 : pos === 'center' ? Math.round(a.y + (a.height - 90) / 2) : a.y + a.height - 130;
  osdWin.setPosition(x, y);
}
async function micMuted() {
  if (!plat.IS_LINUX) return rpc('audio_get').then(a => !!a.mic_muted).catch(() => null);
  return new Promise(resolve => execFile('pactl', ['get-source-mute', '@DEFAULT_SOURCE@'], { timeout: 1500 }, (err, out) => resolve(err ? null : /yes/i.test(String(out)))));
}
async function showOsd(data) {
  if (!osdEnabled(data.kind)) return;
  let msg = { kind: data.kind, duration: state.general.osd_duration || 1500, theme: (state.uiSettings && state.uiSettings.theme) || 'light' };
  if (data.kind === 'mic') { const m = await micMuted(); msg.title = m === null ? t('Microphone') : m ? t('Microphone muted') : t('Microphone on'); msg.sub = m === null ? t('Toggled') : m ? t('Press again to unmute') : t('Press again to mute'); }
  else if (data.kind === 'smartshift') { msg.title = data.mode === 'ratchet' ? t('Ratchet') : t('Free-spin'); msg.sub = data.mode === 'ratchet' ? t('Scroll wheel · SmartShift on') : t('Scroll wheel · SmartShift off'); }
  else if (data.kind === 'backlight' && !(data.num_levels >= 2 && data.level >= 0 && data.level < data.num_levels)) return;   // not a level: nothing to show
  else if (data.kind === 'backlight') { msg.title = t('Backlight'); msg.sub = t('Level {level} of {max}', { level: data.level, max: (data.num_levels || 8) - 1 }); msg.level = data.level; msg.num_levels = (data.num_levels || 8) - 1; }
  else if (data.kind === 'host') { const d = state.devices.find(x => x.id === data.id); const name = d && d.state && d.state.hosts && d.state.hosts.names[data.host] ? d.state.hosts.names[data.host].name : ''; msg.title = name ? t('Switched to {name}', { name }) : t('Switched to host {n}', { n: data.host + 1 }); msg.sub = `${data.device || ''} · ${t('host {n}', { n: data.host + 1 })}`; msg.host = data.host; }
  else if (data.kind === 'dpi') { msg.title = t('{dpi} DPI', { dpi: data.dpi }); msg.sub = data.shift ? `${data.device || ''} · ${t('DPI shift')}` : data.slot ? `${data.device || ''} · ${t('slot {n}', { n: data.slot })}` : data.device || ''; msg.slot = data.slot; msg.shift = !!data.shift; }
  else if (data.kind === 'battery') { msg.title = t('{n}% battery', { n: data.percent }); msg.sub = `${data.device || ''}${data.charging ? ' · ' + t('Charging') : ''}`; msg.level = Math.round((data.percent || 0) / 10); msg.num_levels = 10; }
  else if (data.kind === 'onboard_profile') { msg.title = t('Onboard profile {n}', { n: data.profile }); msg.sub = data.device || ''; }
  const w = ensureOsd();
  const send = () => { positionOsd(); w.showInactive(); w.webContents.send('osd-show', msg); clearTimeout(osdTimer); osdTimer = setTimeout(() => { if (w && !w.isDestroyed()) w.hide(); }, (msg.duration || 1500) + 400); };
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
}
ipcMain.on('osd-hidden', () => { if (osdWin && !osdWin.isDestroyed()) osdWin.hide(); });
ipcMain.handle('osd-test', (_e, kind) => kind === 'emoji' ? showEmoji(t('Preview')) : showOsd({ kind, mode: 'freespin', level: 5, num_levels: 8, host: 1, dpi: 1600, slot: 3, percent: 72, device: kind === 'dpi' || kind === 'battery' ? 'PRO X3 SUPERSTRIKE' : 'MX Master 3S' }));

exports.provide = { osdEnabled, ensureOsd, positionOsd, micMuted, showOsd };
