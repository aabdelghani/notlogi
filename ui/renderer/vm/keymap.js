// View model: a keyboard's own photo, for a keyboard NotLogi has none of. The owner picks a photo and
// clicks each key on it in turn; it is kept as a device file that can be shared and imported.
import { t } from '../../shared/i18n.mjs';
import * as K from '../../shared/keymap.mjs';

// from the rest of the window, filled in by link()
let S, api, changed, store, toast;
export function link(ctx) { ({ S, api, changed, store, toast } = ctx); }

// the screen state this view model owns: the photo being mapped ({ dev, ...the map }), or null
export const state = { keymap: null };

const fileFor = id => (S.userDevices || []).find(f => f.ids.includes(id)) || null;
const keysOf = d => K.keysToPlace(d.controls, (d.state || {}).hosts);
const set = m => { S.keymap = Object.assign({ dev: S.keymap.dev }, m); changed(); };
const slug = s => String(s || 'keyboard').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'keyboard';
async function keep(f) {
  await api.host.userDeviceSave(f);
  await store.loadUserDevices();
}

// a click on the photo being mapped, in photo pixels
function keymapClick(x, y) { if (S.keymap) set(K.place(S.keymap, x, y)); }

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'km-photo': async (it, e, d) => {
    let photo; try { photo = await api.host.pickPhoto(); } catch (x) { toast(t('That photo could not be read'), true); return; }
    if (!photo) return;
    S.keymap = Object.assign({ dev: d.id }, K.startMap({ id: d.id, name: d.name, photo, keys: keysOf(d) })); changed();
  },
  'km-edit': async (it, e, d) => { const f = fileFor(d.id); if (!f) return; S.keymap = Object.assign({ dev: d.id }, K.startMap({ keys: keysOf(d), from: f })); changed(); },
  'km-skip': async () => { if (S.keymap) set(K.skip(S.keymap)); },
  'km-undo': async () => { if (S.keymap) set(K.undo(S.keymap)); },
  'km-again': async (it) => { if (S.keymap) set(K.again(S.keymap, it.data.host !== undefined ? { host: Number(it.data.host) } : { cid: Number(it.data.cid) })); },
  'km-size': async (it) => { if (S.keymap) set(K.resize(S.keymap, Number(it.value))); },
  'km-cancel': async () => { S.keymap = null; changed(); },
  'km-save': async (it, e, d) => {
    const m = S.keymap; if (!m) return;
    try { await keep(K.toFile(m)); } catch (x) { toast(t('The photo could not be saved'), true); return; }
    S.keymap = null; toast(t('Photo saved for {name}', { name: d.name })); changed();
  },
  // the device file, to send to someone with the same keyboard (or to NotLogi, to come with it)
  'km-share': async (it, e, d) => {
    const f = fileFor(d.id); if (!f) return;
    const p = await api.host.saveJson(`notlogi-${slug(d.name)}.json`, f);
    if (p) toast(t('Saved {path}', { path: p }));
  },
  'km-import': async (it, e, d) => {
    let o; try { o = await api.host.openJson(); } catch (x) { toast(t('Not a NotLogi device file'), true); return; }
    if (!o) return;
    const f = K.readFile(o); if (!f) { toast(t('Not a NotLogi device file'), true); return; }
    try { await keep(f); } catch (x) { toast(t('The photo could not be saved'), true); return; }
    toast(f.ids.includes(d.id) ? t('Photo added for {name}', { name: d.name }) : t('Added; it is for another keyboard ({name})', { name: f.name || f.ids.join(', ') }), !f.ids.includes(d.id));
    changed();
  },
  'km-remove': async (it, e, d) => {
    if (!fileFor(d.id)) return;
    S.confirm = { title: t('Remove this photo?'), text: t('The keys keep what they are set to; only the photo goes. Share it first if you want to keep it.'), ok: t('Remove'),
      onOk: async () => { await api.host.userDeviceRemove(d.id); await store.loadUserDevices(); changed(); } };
    S.dlg = 'confirm'; changed();
  },
};

export const provide = { keymapClick };
