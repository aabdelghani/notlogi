// Keyboard photos made by their owners (shared/keymap.mjs): one device file each in the devices
// folder beside the window's settings, the photo inside it.
const { ipcMain, app, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const state = require('./state');

exports.link = () => {};

const DIR = path.join(app.getPath('userData'), 'devices');
const fileOf = id => path.join(DIR, id + '.json');
const MAX_W = 2600;   // a phone photo is cut down to this width: enough for the keys, small enough to share

// every device file kept, readable ones only
function list() {
  let names;
  try { names = fs.readdirSync(DIR).filter(n => n.endsWith('.json')); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    try { const f = state.Keymap.readFile(JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8'))); if (f) out.push(f); } catch (e) {}
  }
  return out;
}
// kept under its first id; a file kept under one of its other ids before is replaced
function save(o) {
  const f = state.Keymap.readFile(o);
  if (!f) throw new Error('not a device file');
  fs.mkdirSync(DIR, { recursive: true });
  for (const id of f.ids.slice(1)) { try { fs.unlinkSync(fileOf(id)); } catch (e) {} }
  fs.writeFileSync(fileOf(f.ids[0]), JSON.stringify(f));
  return f;
}
function remove(id) {
  for (const f of list()) if (f.ids.includes(id)) { try { fs.unlinkSync(fileOf(f.ids[0])); } catch (e) {} }
}
// a photo chosen from disk, as a data URL with its size: a JPEG stays a JPEG, the rest become PNG
async function pickPhoto() {
  const r = await dialog.showOpenDialog(state.win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  let img = nativeImage.createFromPath(r.filePaths[0]);
  if (img.isEmpty()) throw new Error('not an image NotLogi can read');
  if (img.getSize().width > MAX_W) img = img.resize({ width: MAX_W, quality: 'best' });
  const { width: w, height: h } = img.getSize();
  const jpeg = /\.jpe?g$/i.test(r.filePaths[0]);
  return { src: jpeg ? 'data:image/jpeg;base64,' + img.toJPEG(90).toString('base64') : img.toDataURL(), w, h };
}

ipcMain.handle('user-devices', () => list());
ipcMain.handle('user-device-save', (_e, o) => save(o));
ipcMain.handle('user-device-remove', (_e, id) => remove(String(id)));
ipcMain.handle('pick-photo', () => pickPhoto());

exports.provide = {};
