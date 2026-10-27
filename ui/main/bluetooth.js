// Bluetooth: noticing an MX device in pairing mode, the pop-up offering it, and pairing.
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen, ipcMain, Notification } = require('electron');
const plat = require('../platform');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder
const t = (s, v) => (state.I18n ? state.I18n.t(s, v) : s);

// from the other parts of the main process, filled in by link()
let cursorPoint, loadUi, notify, saveUi, systemLook;
exports.link = ctx => { ({ cursorPoint, loadUi, notify, saveUi, systemLook } = ctx); };

// ---------------------------------------------------------------- Bluetooth: devices in pairing mode
// Windows announces a mouse in pairing mode by itself (Swift Pair); BlueZ has nothing like it, so
// LogiMX listens. The scan is Bluetooth Low Energy only (MX devices are LE, and classic inquiry is
// the part that disturbs headphones) and filtered to discoverable devices, the ones in pairing
// mode, so the dozens of other devices around never show up.
// Two modes: 'watch' (in the background, short scans spaced out, a notification for each device)
// and 'pair' (the Add device dialog is open: the scan runs without pause and the list is live).
const BT_WATCH_ON_MS = 10000, BT_WATCH_OFF_MS = 20000, BT_RENOTIFY_MS = 10 * 60000;
const btNotified = new Map();     // address -> when we last told the user
const btFound = new Map();        // address -> { address, name, kind }, what the dialog lists
let btScan = null, btPairing = null, btPairOpen = false;
const stripAnsi = t => t.replace(/\x1b\[[0-9;]*m/g, '');   // eslint-disable-line no-control-regex -- terminal colour codes
const isLogiName = n => /^(MX[ -]|Logi|Logitech|Signature|Lift|ERGO|Pebble|POP |[KM]\d{3}\b)/i.test(n || '');
const btEmit = data => { notify('bt-event', data); if (btPopWin && !btPopWin.isDestroyed()) btPopWin.webContents.send('bt-event', data); };
function btInfo(addr) {
  return new Promise(res => execFile('bluetoothctl', ['info', addr], { timeout: 4000 }, (err, out) => {
    if (err) return res(null);
    const get = k => { const m = new RegExp(`^\\s*${k}: (.*)$`, 'm').exec(out || ''); return m ? m[1].trim() : ''; };
    // the advertising flags, when BlueZ heard them just now: bit 0 or 1 set means discoverable (pairing mode)
    const fl = /AdvertisingFlags:\s*\n\s*([0-9a-f]{2})/i.exec(out || '');
    res({ name: get('Name') || get('Alias'), paired: get('Paired') === 'yes', connected: get('Connected') === 'yes', icon: get('Icon'), logi: /ManufacturerData\.Key: 0x01da/i.test(out || ''), flags: fl ? parseInt(fl[1], 16) : null });
  }));
}
const btKind = (info, name) => /keyboard/i.test((info && info.icon) || '') || /keys|^K\d{3}|ERGO K/i.test(name) ? 'keyboard' : 'mouse';
async function btCandidate(addr, nameHint) {
  if (btPairing) return;
  const info = await btInfo(addr);
  if (!info || info.connected) return;
  // heard because another app is scanning without our filter: its flags say it is not pairing
  if (info.flags !== null && !(info.flags & 3)) return;
  const name = info.name || nameHint;
  if (!isLogiName(name) && !info.logi) return;
  const dev = { address: addr, name, kind: btKind(info, name), paired: info.paired };
  const isNew = !btFound.has(addr);
  btFound.set(addr, dev);
  if (isNew) btEmit({ type: 'found', list: [...btFound.values()] });
  // the dialog is open and shows it; otherwise a notification, at most every ten minutes per device
  if (state.btMode !== 'watch') return;
  const seen = btNotified.get(addr);
  if (seen && Date.now() - seen < BT_RENOTIFY_MS) return;
  if (btPopShown()) return;   // one device at a time; the next is offered when this one is done
  btNotified.set(addr, Date.now());
  btPopShow(dev);
}
// The pop-up for a device in pairing mode. It takes the keyboard, since the mouse being paired may
// be the only one: Tab between Connect, Not now and Turn off, Enter to choose, Esc to close.
const BTPOP_W = 540, BTPOP_H = 250;
let btPopWin = null, btPopDev = null, btPopTimer = null;
const btPopShown = () => !!(btPopWin && !btPopWin.isDestroyed() && btPopWin.isVisible());
// a photo of the model when its name says which one it is
function btPhoto(name) {
  const n = name || '';
  const f = /Master 4/i.test(n) ? 'b042.png' : /Anywhere/i.test(n) ? 'b037-top.png' : /Master/i.test(n) ? 'b034.png' : /Keys/i.test(n) ? 'b378.png' : /K650/i.test(n) ? 'b36f.png' : null;
  return f && fs.existsSync(path.join(ROOT, 'assets', 'devices', f)) ? '../assets/devices/' + f : null;
}
function ensureBtPop() {
  if (btPopWin && !btPopWin.isDestroyed()) return btPopWin;
  btPopWin = new BrowserWindow({
    width: BTPOP_W, height: BTPOP_H, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false, show: false, focusable: true,
    title: t('NotLogi: connect a device'),
    webPreferences: { preload: path.join(ROOT, 'preload-btpop.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  btPopWin.setAlwaysOnTop(true, 'pop-up-menu');
  btPopWin.loadFile(path.join(ROOT, 'renderer', 'btpop.html'));
  btPopWin.on('closed', () => { btPopWin = null; });
  return btPopWin;
}
async function btPopShow(dev) {
  const w = ensureBtPop();
  btPopDev = dev;
  // centred on the screen with the pointer, a little above the middle
  const at = await cursorPoint().catch(() => screen.getCursorScreenPoint());
  const area = screen.getDisplayNearestPoint(at).workArea;
  w.setBounds({ x: Math.round(area.x + (area.width - BTPOP_W) / 2), y: Math.round(area.y + area.height * 0.38 - BTPOP_H / 2), width: BTPOP_W, height: BTPOP_H });
  const look = await systemLook().catch(() => ({}));
  const send = () => w.webContents.send('btpop-show', { device: dev, look, photo: btPhoto(dev.name) });
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
  w.show(); w.moveTop(); w.focus();
  clearTimeout(btPopTimer);
  btPopTimer = setTimeout(() => { if (!btPairing) btPopHide(); }, 60000);   // left alone for a minute: it goes away
}
function btPopHide() {
  clearTimeout(btPopTimer); btPopTimer = null; btPopDev = null;
  if (btPopWin && !btPopWin.isDestroyed()) btPopWin.hide();
}
// preview, like the overlay test: a pretend device, and its states on request
ipcMain.handle('btpop-test', (_e, stage) => {
  const dev = { address: '00:00:00:00:00:00', name: stage && stage.name || 'MX Master 3S', kind: stage && stage.kind || 'mouse' };
  if (!stage || stage.state === 'show') return btPopShow(dev);
  btEmit(Object.assign({ type: 'pair', address: dev.address, name: dev.name }, stage));
});
ipcMain.on('btpop-act', (_e, { action, address }) => {
  if (action === 'connect' && address) { const d = btFound.get(address) || btPopDev; if (d) btPair(address, d.name); return; }
  if (action === 'off') {
    state.uiSettings = state.uiSettings || loadUi(); state.uiSettings.bt_watch = false; saveUi(state.uiSettings);
    notify('ui-changed', state.uiSettings);
    btSetMode();
  }
  btPopHide();
});
// one bluetoothctl session: LE only, discoverable devices only. Devices BlueZ already knows are
// listed when it starts; only what arrives after "Discovery started" is a device seen now.
function btStartScan() {
  if (btScan || btPairing) return;
  let p;
  try { p = spawn('bluetoothctl'); } catch (e) { return; }
  btScan = p;
  let buf = '', live = false;
  const send = c => { try { p.stdin.write(c + '\n'); } catch (e) {} };
  p.stdout.on('data', d => {
    buf += stripAnsi(d.toString());
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      if (/Discovery started|Discovering: yes/.test(l)) live = true;
      if (!live) continue;
      // [NEW] Device AA:BB:.. MX Master 3S  /  [CHG] Device AA:BB:.. RSSI: -60  /  ... Name: MX Keys S
      const m = /\[(NEW|CHG)\] Device ([0-9A-F:]{17})\s*(.*)$/i.exec(l);
      if (!m) continue;
      const rest = m[3].trim(), nm = /^(?:Name|Alias): (.*)$/.exec(rest);
      if (m[1] === 'NEW' || /^RSSI|^ManufacturerData|^Name|^Alias/.test(rest)) btCandidate(m[2].toUpperCase(), nm ? nm[1] : (m[1] === 'NEW' ? rest : ''));
    }
  });
  p.stdin.on('error', () => {});
  p.on('error', () => { if (btScan === p) btScan = null; });
  p.on('exit', () => { if (btScan === p) btScan = null; });
  send('menu scan'); send('transport le'); send('discoverable on'); send('back'); send('scan on');
}
function btStopScan() {
  if (!btScan) return;
  const p = btScan; btScan = null;
  try { p.stdin.write('scan off\nquit\n'); } catch (e) {}
  setTimeout(() => { try { p.kill(); } catch (e) {} }, 1500);
}
// what should be running now: the dialog's live scan, the background watch, or nothing
function btSetMode() {
  const want = !plat.IS_LINUX || btPairing ? null : btPairOpen ? 'pair' : (state.uiSettings || loadUi()).bt_watch !== false ? 'watch' : null;
  if (want === state.btMode && (want !== 'pair' || btScan)) return;
  state.btMode = want;
  clearTimeout(state.btTimer); state.btTimer = null;
  btStopScan();
  if (want === 'pair') { setTimeout(btStartScan, 300); return; }
  if (want === 'watch') {
    const cycle = () => {
      if (state.btMode !== 'watch') return;
      btStartScan();
      state.btTimer = setTimeout(() => { btStopScan(); state.btTimer = setTimeout(cycle, BT_WATCH_OFF_MS); }, BT_WATCH_ON_MS);
    };
    state.btTimer = setTimeout(cycle, 3000);
  }
}
// pair, trust and connect in one bluetoothctl session; a keyboard's passkey is shown to type. A
// device that was paired here before and is in pairing mode again has a stale bond: removed first.
function btPair(addr, name) {
  if (btPairing) return;
  const dev = btFound.get(addr) || { address: addr, name };
  btPairing = addr;
  clearTimeout(state.btTimer); state.btTimer = null; btStopScan(); state.btMode = null;
  const quiet = () => (btPairOpen && state.win && !state.win.isDestroyed() && state.win.isVisible()) || btPopShown();   // the dialog or the pop-up shows progress itself
  const say = (title, body) => { if (!quiet() && Notification.isSupported()) new Notification({ title, body, icon: path.join(ROOT, 'assets', 'icon.png') }).show(); };
  const progress = (s, extra) => btEmit(Object.assign({ type: 'pair', address: addr, name, state: s }, extra || {}));
  progress('pairing'); say(t('Connecting {name}…', { name }), t('Keep it in pairing mode for a few seconds.'));
  let p;
  try { p = spawn('bluetoothctl'); } catch (e) { btPairing = null; progress('failed', { why: t('bluetoothctl is not available.') }); return btSetMode(); }
  let out = '', done = false, step = 'pair';
  const send = c => { try { p.stdin.write(c + '\n'); } catch (e) {} };
  const finish = (ok, why) => {
    if (done) return; done = true; btPairing = null;
    send('scan off'); send('quit'); setTimeout(() => { try { p.kill(); } catch (e) {} }, 1500);
    if (ok) {
      btNotified.set(addr, Date.now() + 24 * 3600e3); btFound.delete(addr);
      progress('connected'); say(t('{name} is connected', { name }), t('NotLogi picks it up in a moment.'));
      if (btPopShown()) { clearTimeout(btPopTimer); btPopTimer = setTimeout(btPopHide, 2600); }
    } else {
      why = why || t('Put it back in pairing mode and try again.');
      progress('failed', { why }); say(t('Could not connect {name}', { name }), why);
    }
    setTimeout(btSetMode, 2000);
  };
  p.stdin.on('error', () => {});
  p.stdout.on('data', d => {
    out += stripAnsi(d.toString());
    const pk = /Passkey:? (\d{6})/i.exec(out) || /Confirm passkey (\d{6})/i.exec(out);
    if (pk && !out.includes('[shown ' + pk[1] + ']')) { out += '[shown ' + pk[1] + ']'; progress('passkey', { passkey: pk[1] }); say(t('Type {code} on {name}', { code: pk[1], name }), t('Then press Enter on it.')); }
    if (/Confirm passkey|Request confirmation/i.test(out) && !out.includes('[confirmed]')) { out += '[confirmed]'; send('yes'); }
    if (step === 'pair' && /Pairing successful|AlreadyExists/i.test(out)) { step = 'connect'; send(`trust ${addr}`); send(`connect ${addr}`); }
    if (step === 'connect' && /Connection successful/i.test(out)) finish(true);
    if (/Failed to pair|AuthenticationFailed|AuthenticationCanceled|not available/i.test(out)) finish(false);
    if (step === 'connect' && /Failed to connect/i.test(out)) finish(false, t('{name} paired, but did not connect. Turn it off and on again.', { name }));
  });
  p.on('exit', () => finish(false));
  send('agent KeyboardDisplay'); send('default-agent');
  if (dev.paired) send(`remove ${addr}`);
  send('menu scan'); send('transport le'); send('back'); send('scan on');
  setTimeout(() => send(`pair ${addr}`), dev.paired ? 4000 : 2500);
  setTimeout(() => finish(false, t('It took too long. Put it back in pairing mode and try again.')), 45000);
}
ipcMain.handle('bt-open', () => { btPairOpen = true; btFound.clear(); btSetMode(); return { linux: plat.IS_LINUX, list: [] }; });
ipcMain.handle('bt-close', () => { btPairOpen = false; btSetMode(); });
ipcMain.handle('bt-connect', (_e, addr) => { const d = btFound.get(addr); if (d) btPair(addr, d.name); });

exports.provide = { BT_WATCH_ON_MS, BT_WATCH_OFF_MS, BT_RENOTIFY_MS, btNotified, btFound, stripAnsi, isLogiName, btEmit, btInfo, btKind, btCandidate, BTPOP_W, BTPOP_H, btPopShown, btPhoto, ensureBtPop, btPopShow, btPopHide, btStartScan, btStopScan, btSetMode, btPair };
