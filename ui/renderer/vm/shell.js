// View model of the window itself: which page and device are on screen, menus, theme, the
// agent's state, first run.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let IS_MAC, IS_WIN, S, SLOTS, agentNeedsBuild, api, applyPreset, call, changed, dev, devicePages, drawerUp, fx, gestureControl, go, isOffline, openPicker, refresh, ringSelect, sidePanelClosed, toast, ringEditorOn, openRingPanel, closeTool;
export function link(ctx) { ({ IS_MAC, IS_WIN, S, SLOTS, agentNeedsBuild, api, applyPreset, call, changed, dev, devicePages, drawerUp, fx, gestureControl, go, isOffline, openPicker, refresh, ringSelect, sidePanelClosed, toast, ringEditorOn, openRingPanel, closeTool } = ctx); }

// the screen state this view model owns: where the window is: page and device, dialog and menu open, first run, theme
export const state = {
  theme: 'light', mode: 'app', page: 'home', dev: null, dlg: null, menu: null, appDetail: null, conflictDismissed: false,
  ob: { step: 1, preset: 'gnome' }, ptSel: undefined, esSel: undefined, blClosed: undefined,
  cfgFrom: undefined, cfgKind: undefined, cfgBack: undefined,
  navFwd: [], navAt: null,   // where the mouse's Forward button goes back to, and the place it is valid from
};

// Home's devices: all of them, except inactive ones removed from the list (they come back when
// they connect again; their settings are kept)
const hiddenDevices = () => (S.ui && S.ui.hidden_devices) || [];
const homeDevices = () => S.devices.filter(d => !(isOffline(d) && hiddenDevices().includes(d.id)));
// a removed device that connects again is listed again
function unhideIfBack(d) {
  if (!d || isOffline(d) || !hiddenDevices().includes(d.id)) return;
  api.host.uiSettings({ hidden_devices: hiddenDevices().filter(x => x !== d.id) }).then(u => { if (u) S.ui = u; changed(); }).catch(() => {});
}
// where the window is, for the mouse's Back and Forward buttons
const navKey = () => `${S.page}|${S.dev}|${S.appDetail ? 'app' : ''}|${(S.ringPath || []).join(',')}`;
const navPlace = () => ({ key: navKey(), page: S.page, dev: S.dev, cfgFrom: S.cfgFrom, cfgKind: S.cfgKind, cfgBack: S.cfgBack, ringPath: (S.ringPath || []).slice() });
// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'page': async (it, e, d, key) => { go(it.data.page); if (it.data.page === 'ring') openRingPanel(); return; },
  // the mouse's Back button: what the back arrow does, remembering the place left so Forward can return
  'nav-back': async (it, e, d, key) => {
    const snap = navPlace(), fwd = S.navAt === navKey() ? S.navFwd : [];
    await commands['go-home'](it, e, d, key);
    S.navFwd = navKey() !== snap.key ? [snap].concat(fwd).slice(0, 20) : fwd;
    S.navAt = navKey();
    return;
  },
  // the mouse's Forward button: back to the place Back left, as long as nothing else moved the window since
  'nav-forward': async (it, e, d, key) => {
    if (S.navAt !== navKey() || !S.navFwd.length) return;
    const [p, ...rest] = S.navFwd;
    if (p.page === S.page && p.dev === S.dev && p.ringPath.length) { S.ringPath = p.ringPath.slice(); S.ringAnim = { kind: 'in', from: p.ringPath[0] }; changed(); }
    else {
      go(p.page, p.dev);
      if (p.page === 'gestures') { S.cfgFrom = p.cfgFrom; S.cfgKind = p.cfgKind; S.cfgBack = p.cfgBack; }
      if (ringEditorOn()) { openRingPanel(dev()); if (p.ringPath.length) { S.ringPath = p.ringPath.slice(); changed(); } }
    }
    S.navFwd = rest; S.navAt = navKey();
    return;
  },
  'go-home': async (it, e, d, key) => {
    if (ringEditorOn() && (S.ringPath || []).length) { const i = S.ringPath[0]; S.ringPath = []; S.menu = null; S.ringAnim = { kind: 'out', from: i }; ringSelect(i); changed(); return; }
    // opened from a button's Configure: back to the mouse's Buttons, panel and all
    // with that button's actions open again on the right (the panel changes in place)
    if (S.cfgFrom && S.page === 'gestures') {
      const back = S.cfgBack, dd = dev();
      S.page = S.cfgFrom; S.cfgFrom = null; S.cfgBack = null;
      if (back && dd) openPicker({ drawer: true, dev: dd, section: 'buttons', cid: back.cid, label: back.label, profile: back.profile });
      else { S.dlg = null; S.picker = null; changed(); }
      return;
    }
    // with a panel open on the right, the back arrow folds the panel away first
    if (drawerUp() && S.page !== 'ring') { fx.closeDrawer(); return; }
    if (S.page === 'ring') { S.dlg = null; S.picker = null; }
    if (fx.panelOpen()) { fx.closeDrawer(sidePanelClosed); return; }
    if (S.picker && S.picker.recording) { fx.stopRecorder(); S.picker.recording = false; } go('home'); return;
  },
  'dev-hide': async (it, e, d, key) => {
    const dd = S.devices.find(x => x.id === key); if (!dd) return;
    S.confirm = { title: t('Remove {name}?', { name: dd.name }), text: t('{name} is not connected. It leaves the list, and comes back with its settings when it connects again.', { name: dd.name }), ok: t('Remove'), onOk: async () => {
      S.ui = await api.host.uiSettings({ hidden_devices: hiddenDevices().concat(key) }) || S.ui;
      toast(t('{name} removed', { name: dd.name }));
    } };
    S.dlg = 'confirm'; changed(); return;
  },
  'home-step': async (it, e, d, key) => { fx.scrollHome(Number(key)); return; },
  'home-open': async (it, e, d, key) => { go(devicePages(S.devices.find(x => x.id === key) || {})[0], key); return; },
  'bl-open': async (it, e, d, key) => { if (S.blClosed) { S.blClosed = false; changed(); } return; },
  // Point & scroll opens on the mouse alone, like Buttons; its tag or the mouse opens the panel
  'home-page': async (it, e, d, key) => { S.blClosed = it.data.page === 'pointer' || it.data.page === 'easy'; S.ptSel = null; S.esSel = null; go(it.data.page, key); return; },
  'es-pick': async (it, e, d, key) => { const i = Number(it.data.cid); if (!S.blClosed && S.esSel === i) { fx.closeDrawer(() => { S.blClosed = true; }); return; } S.esSel = i; S.blClosed = false; changed(); return; },
  'pt-pick': async (it, e, d, key) => { const k = it.data.cid; if (!S.blClosed && S.ptSel === k) { fx.closeDrawer(() => { S.blClosed = true; }); return; } S.ptSel = k; S.blClosed = false; changed(); return; },
  'dir-pick': async (it, e, d, key) => { S.dir = key; const cid = gestureControl(d); openPicker({ drawer: S.page === 'gestures', dev: d, section: 'gesture', cid, label: SLOTS[key][0], slot: SLOTS[key][1] }); return; },
  'back-apps': async (it, e, d, key) => { S.appDetail = null; changed(); return; },
  'win-close': async (it, e, d, key) => { api.host.windowAction('close'); return; },
  'win-min': async (it, e, d, key) => { api.host.windowAction('minimize'); return; },
  'quit': async (it, e, d, key) => { api.host.windowAction('quit'); return; },
  'menu-theme': async (it, e, d, key) => { S.menu = S.menu === 'theme' ? null : 'theme'; changed(); return; },
  'menu-ringprof': async (it, e, d, key) => { S.menu = S.menu === 'ringprof' ? null : 'ringprof'; changed(); return; },
  'theme': async (it, e, d, key) => { S.theme = key; try { localStorage.setItem('theme', key); } catch (x) {} api.host.setTheme(key); S.menu = null; changed(); return; },
  // the main process loads every window again in the language chosen
  'lang-select': async (it, e, d, key) => { const v = it.value === 'system' ? null : it.value; S.ui = await api.host.uiSettings({ language: v }) || S.ui; return; },
  'theme-select': async (it, e, d, key) => { S.theme = it.value; try { localStorage.setItem('theme', it.value); } catch (x) {} api.host.setTheme(it.value); changed(); return; },
  'start-agent': async (it, e, d, key) => {
    const build = agentNeedsBuild();
    S.agentBusy = true; S.agentErr = null; S.buildStep = build ? t('Preparing the build…') : null; changed();
    let r;
    try { r = build ? await api.host.buildAgent() : await api.host.startAgent(); }
    catch (x) { r = { ok: false, error: x.message }; }
    S.agentBusy = false; S.buildStep = null;
    try { S.agentInfo = await api.host.agentInfo(); } catch (x) {}
    if (r && r.ok) { toast(t('Agent started')); try { await refresh(); } catch (x) {} }
    else { S.agentErr = (r && r.error) || t('could not start'); toast(t('Could not start the agent: {error}', { error: S.agentErr }), true); }
    changed(); return;
  },
  'osd-test': async (it, e, d, key) => { api.host.osdTest(key); return; },
  'pause': async (it, e, d, key) => { await call(S.status.paused ? 'resume_diversion' : 'pause_diversion'); S.status = await call('status'); changed(); return; },
  'dismiss-conflict': async (it, e, d, key) => { S.conflictDismissed = true; changed(); return; },
  'stop-tool': async (it, e, d, key) => { const r = await api.host.stopTool(it.data.tool); toast(r && r.ok ? t('{tool} stopped', { tool: it.data.tool }) : (r && r.error) || t('Could not stop'), !(r && r.ok)); setTimeout(refresh, 1500); return; },
  'open': async (it, e, d, key) => { api.host.openExternal(it.data.url); return; },
  'close-dlg': async (it, e, d, key) => { if (S.dlg === 'prompt' && S.prompt && S.prompt.back) { S.dlg = S.prompt.back; changed(); return; } if (drawerUp()) { fx.closeDrawer(); return; } fx.stopRecorder(); if (S.dlg === 'pair') { call('pair_cancel').catch(() => {}); if (S.pair && S.pair.bt) api.host.btClose(); } if (S.dlg === 'gaming') { closeTool(); S.gtool = null; } S.dlg = null; changed(); return; },
  'dir': async (it, e, d, key) => { S.dir = key; changed(); return; },
  'im-open': async (it, e, d, key) => { await api.host.inputMonitoringOpen(); setTimeout(async () => { try { S.ax = await api.host.accessibility(false); S.status = await call('status'); changed(); } catch (err) {} }, 4000); return; },
  'ax-open': async (it, e, d, key) => { api.host.accessibility(true); api.host.openAccessibility(); setTimeout(async () => { S.ax = await api.host.accessibility(false); changed(); }, 4000); return; },
  'install-udev': async (it, e, d, key) => { const r = await api.host.installUdev(); toast(r && r.ok ? t('Rule installed, re-plug the receiver') : (r && r.error) || t('Failed'), !(r && r.ok)); setTimeout(refresh, 2000); return; },
  'onboard': async (it, e, d, key) => { S.mode = 'onboard'; S.ob = { step: 1, preset: IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome' }; changed(); return; },
  'ob-close': async (it, e, d, key) => { S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} changed(); return; },
  'ob-step': async (it, e, d, key) => { S.ob.step = Number(key); changed(); return; },
  'ob-prev': async (it, e, d, key) => { S.ob.step = Math.max(1, S.ob.step - 1); changed(); return; },
  'ob-next': async (it, e, d, key) => { if (S.ob.step < 3) { S.ob.step++; changed(); } else { await applyPreset(S.ob.preset); S.mode = 'app'; try { localStorage.setItem('onboarded', '1'); } catch (x) {} changed(); } return; },
  'ob-preset': async (it, e, d, key) => { S.ob.preset = key; changed(); return; },
};

export const provide = { homeDevices, unhideIfBack };
