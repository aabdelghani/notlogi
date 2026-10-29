// View model: application profiles and the ready-made gesture presets.
import { isMouse } from '../../shared/profiles.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, allProfiles, api, appClass, call, changed, dev, deviceProfiles, fx, gestureControl, merge, prompt, setAssign, toast;
export function link(ctx) { ({ S, allProfiles, api, appClass, call, changed, dev, deviceProfiles, fx, gestureControl, merge, prompt, setAssign, toast } = ctx); }

// the screen state this view model owns: the profile edited and the one previewed (hover), the add panel and its ticks
export const state = {
  editProfile: undefined, previewProfile: undefined, addPanel: undefined, addSel: undefined,
};

async function addProfile(name, cls, here) {
  name = (name || '').trim(); cls = (cls || '').trim();
  if (!name || !cls) return toast(t('Pick an application'), true);
  if (/logimx|notlogi/i.test(cls)) return toast(t('NotLogi itself cannot have a profile'), true);
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (const dd of here ? [dev()] : S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (!profs[key]) { profs[key] = { name, match: [cls] }; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } }
  if (here === 'quiet') return;   // the add panel: in the bar, set up when clicked (it says so once for all)
  if (here) { S.editProfile = key; S.dlg = null; changed(); return; }   // from a device's profile bar: that device only, editing it
  S.appDetail = { key, name, match: [cls] }; changed();
}
// A starting point everyone gets once: LibreOffice Writer, with its thumb wheel zooming and the
// side buttons undoing and redoing. Seeded the first time a mouse is seen; removing it is final.
let seeding = false;
async function seedProfiles() {
  if (seeding || !S.ui || S.ui.seeded_profiles || !S.devices.some(isMouse)) return;
  seeding = true;
  try {
    const has = S.devices.some(dd => Object.values((dd.config || {}).profiles || {}).some(p => (p.match || []).includes('libreoffice-writer')));
    if (!has) for (const dd of S.devices.filter(isMouse)) {
      const profs = JSON.parse(JSON.stringify(dd.config.profiles));
      profs['libreoffice-writer'] = { name: 'LibreOffice Writer', match: ['libreoffice-writer'], buttons: { 83: 'undo', 86: 'redo', 196: 'smartshift_toggle' }, thumbwheel: 'zoom_wheel' };
      merge(await call('set_profiles', { id: dd.id, profiles: profs }));
    }
    S.ui = await api.host.uiSettings({ seeded_profiles: true }) || S.ui;
    changed();
  } catch (e) { } finally { seeding = false; }
}
async function applyPreset(k) {
  const P = { gnome: { tap: 'overview', up: 'workspace_prev', down: 'workspace_next', left: 'tab_prev', right: 'tab_next' },
    mac: { tap: 'overview', up: 'maximize', down: 'show_desktop', left: 'workspace_prev', right: 'workspace_next' },
    win: { tap: 'overview', up: 'maximize', down: 'minimize', left: 'app_switcher', right: 'app_switcher' } }[k];
  for (const d of S.devices.filter(isMouse)) {
    const g = { type: 'gesture', label: `${k === 'gnome' ? 'GNOME' : k === 'mac' ? 'macOS-like' : 'Windows-like'} preset`, threshold: 60 };
    for (const [slot, preset] of Object.entries(P)) { g[slot === 'tap' ? 'click' : slot] = Object.assign({}, S.presets.all[preset], { preset }); }
    await setAssign(d, 'buttons', gestureControl(d), g);
    if (k !== 'gnome') await setAssign(d, 'thumbwheel', '', k === 'mac' ? 'workspaces_wheel' : 'hscroll');
  }
  toast(t('Preset applied'));
}

// + in the profile bar: the device's applications to choose from, like a key's actions. Global
// settings is listed first (what everything starts from), then each installed application with its
// icon; one picked with its check mark, Add puts it in the profile bar to configure from there.
const addLabel = () => (S.addSel || []).length > 1 ? t('Add {n}', { n: S.addSel.length }) : t('Add');
// hovering an app in the profile bar shows its profile until the pointer leaves the bar
function previewProfile(k) {
  if (k) { if (S.previewProfile !== k && S.editProfile !== k) { S.previewProfile = k; changed(); } }
  else if (S.previewProfile) { S.previewProfile = null; changed(); }
}
// an application's icon (a data URL), looked up by the main process
const appIcon = a => api.host.appIcon({ icon: a.icon, id: a.id });
// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'pf-edit': async (it, e, d, key) => { const k = key === 'default' ? null : key; if ((S.editProfile || null) === k) return; S.editProfile = k; S.ringPath = []; S.previewProfile = null; S.dlg = null; S.picker = null; changed(); return; },
  'pf-add': async (it, e, d, key) => { if (S.addPanel) return; S.addPanel = true; S.addSel = []; S.dlg = null; S.picker = null; S.previewProfile = null; if (!S.apps) { try { S.apps = await api.quiet('applications'); } catch (e) { S.apps = []; } } changed(); return; },
  'add-pick': async (it, e, d, key) => {
    // tick or untick; the bar shows the ticked ones at once, faded until Add
    const sel = S.addSel || (S.addSel = []), i = sel.indexOf(key);
    if (i >= 0) sel.splice(i, 1); else sel.push(key);
    fx.markAddPick(key, i < 0, sel.length, addLabel());
    fx.refreshBar();
    return;
  },
  'add-confirm': async (it, e, d, key) => {
    const picked = (S.addSel || []).map(id => (S.apps || []).find(x => x.id === id)).filter(Boolean);
    if (!picked.length) return;
    S.addSel = [];
    fx.closeDrawer(() => { S.addPanel = false; });
    for (const a of picked) await addProfile(a.name, a.wm_class || a.id || appClass(a.name), 'quiet');
    toast(picked.length > 1 ? t('{n} applications added. Click one to set it up.', { n: picked.length }) : t('{name} added. Click it to set it up.', { name: picked[0].name }));
    changed(); return;
  },
  'pf-remove': async (it, e, d, key) => {
    const dd = dev(), p = deviceProfiles(dd).find(x => x.key === key); if (!p) return;
    S.previewProfile = null;
    S.confirm = { title: t('Remove {app} settings?', { app: p.name }), text: t('This permanently removes the custom settings for {app} on your {device}. In {app}, it goes back to the global settings.', { app: p.name, device: dd.name }), ok: t('Remove'), onOk: async () => {
      const profs = JSON.parse(JSON.stringify(dd.config.profiles)); delete profs[key]; merge(await call('set_profiles', { id: dd.id, profiles: profs }));
      if (S.editProfile === key) S.editProfile = null;
      toast(t('{app} settings removed', { app: p.name }));
    } };
    S.dlg = 'confirm'; changed(); return;
  },
  // a confirmation's own tick box (Don't show this again), read by its onOk
  'confirm-check': async () => { if (S.confirm && S.confirm.check) { S.confirm.check.on = !S.confirm.check.on; changed(); } return; },
  'confirm-ok': async (it, e, d, key) => { const p = S.confirm; S.dlg = null; S.confirm = null; changed(); if (p && p.onOk) { await p.onOk(); changed(); } return; },
  'reset-overrides': async (it, e, d, key) => { for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { const keep = { name: profs[key].name, match: profs[key].match }; profs[key] = keep; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } toast(t('Overrides cleared')); changed(); return; },
  'reset-buttons': async (it, e, d, key) => { const defs = ((await api.quiet('defaults', { id: d.id })).profiles || {}).default || {}; const btns = defs.buttons || {}; for (const cid of Object.keys(btns)) await setAssign(d, 'buttons', cid, btns[cid]); if (defs.thumbwheel) await setAssign(d, 'thumbwheel', null, defs.thumbwheel); toast(t('Buttons reset to defaults')); changed(); return; },
  'app-detail': async (it, e, d, key) => { const p = allProfiles().find(x => x.key === key); S.appDetail = key === 'default' ? { key: 'default', name: t('Default') } : Object.assign({ key }, p || { name: key }); S.menu = null; changed(); return; },
  'add-app': async (it, e, d, key) => { prompt(t('Add application'), [{ key: 'name', label: t('Application'), placeholder: 'Firefox', list: (S.apps || []).map(a => ({ value: a.name })) }], v => addProfile(v.name, appClass(v.name)), t('Add')); return; },
  'add-app-quick': async (it, e, d, key) => { await addProfile(it.data.name, it.data.cls); return; },
  'rename-profile': async (it, e, d, key) => { prompt(t('Rename profile'), [{ key: 'name', label: t('Name'), value: (S.appDetail || {}).name }], async v => { for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { profs[key].name = v.name; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } S.appDetail.name = v.name; changed(); }, t('Rename')); return; },
  'del-profile': async (it, e, d, key) => { if (!confirm(t('Remove this profile on all devices?'))) return; for (const dd of S.devices) { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[key]) { delete profs[key]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } } S.appDetail = null; changed(); return; },
  'ov-reset': async (it, e, d, key) => { const dd = S.devices.find(x => x.id === it.data.dev); const profs = JSON.parse(JSON.stringify(dd.config.profiles)); const sect = profs[it.data.profile][it.data.section]; if (sect) delete sect[it.data.cid]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); changed(); return; },
};

export const provide = { addProfile, seedProfiles, applyPreset, addLabel, previewProfile, appIcon };
