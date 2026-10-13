// The settings window, MVVM:
//   Model       model/api.js (every request to the agent and the main process), model/store.js (what
//               they know, kept up to date by their events), ../shared/ (the logic the main process
//               shares: rings, profiles, actions, battery)
//   View models vm/*.js: each screen's state, what follows from it, and its commands (a button's
//               data-act name → a command on plain data); they never touch the page
//   Views       view/*.js: draw the page from the view models and turn input into commands
// This file builds the Model, links the modules together and starts the window.
import { createApi } from './model/api.js';
import { createStore } from './model/store.js';
import { t } from '../shared/i18n.mjs';
import * as htmlView from './view/html.js';
import * as fxView from './view/fx.js';
import * as coreVM from './vm/core.js';
import * as recorderView from './view/recorder.js';
import * as renderView from './view/render.js';
import * as dndView from './view/dnd.js';
import * as mouseView from './view/mouse.js';
import * as keyboardView from './view/keyboard.js';
import * as deviceView from './view/device.js';
import * as profilesView from './view/profiles.js';
import * as ringView from './view/ring.js';
import * as homeView from './view/home.js';
import * as settingsView from './view/settings.js';
import * as ringVM from './vm/ring.js';
import * as flowVM from './vm/flow.js';
import * as pickerVM from './vm/picker.js';
import * as pickerView from './view/picker.js';
import * as dialogsView from './view/dialogs.js';
import * as dispatchView from './view/dispatch.js';
import * as profilesVM from './vm/profiles.js';
import * as shellVM from './vm/shell.js';
import * as gesturesVM from './vm/gestures.js';
import * as deviceVM from './vm/device.js';
import * as settingsVM from './vm/settings.js';
import * as pairVM from './vm/pair.js';
import * as dialogsVM from './vm/dialogs.js';
const MODULES = [htmlView, fxView, coreVM, recorderView, renderView, dndView, mouseView, keyboardView, deviceView, profilesView, ringView, homeView, settingsView, ringVM, flowVM, pickerVM, pickerView, dialogsView, dispatchView, profilesVM, shellVM, gesturesVM, deviceVM, settingsVM, pairVM, dialogsVM];
(() => {
  const $ = s => document.querySelector(s);
  const root = $('#root');

  // the Model: requests to the agent, and what it knows mirrored here
  const api = createApi(window.agent, msg => toast(msg, true));
  const store = createStore(api);
  // The screens' state is owned by the view models (each one's `state`); S reads and writes a
  // field where it lives: the Model's data in the store, the rest in the view model owning it.
  const owner = {};
  for (const m of MODULES) if (m.state) for (const k of Object.keys(m.state)) owner[k] = m.state;
  const loose = {};   // a field no view model declares (kept, but it should be declared)
  const S = new Proxy(loose, {
    get: (t, k) => k in store.data ? store.data[k] : owner[k] ? owner[k][k] : t[k],
    set: (t, k, v) => { if (k in store.data) store.data[k] = v; else if (owner[k]) owner[k][k] = v; else t[k] = v; return true; },
  });
  try { S.theme = localStorage.getItem('theme') || 'light'; } catch (e) {}
  const VERSION = '0.12.4';

  // ------------------------------------------------------------------ rpc
  const call = api.call;
  window.addEventListener('resize', () => { alignToNav(); homeFit(); });
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.toggle('err', !!err);
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const merge = store.merge;
  const setSetting = api.setSetting;
  const setGeneral = store.setGeneral;
  const setAssign = (d, section, control, action, profile) => store.assign(d, section, control, action, profile || S.editProfile || 'default');

  // --------------------------------------------------------- lifecycle
  const loadLogs = store.loadLogs;
  async function refresh() {
    try {
      await store.load();
      // repair slots an earlier build saved with the ring's own key, so the ring itself can run them
      if (JSON.stringify((S.general || {}).ring || {}).includes('"ring:profile"')) { const r = ringState(); saveRing({ profiles: r.profiles, apps: r.apps }).catch(() => {}); }
      if (!S.dev || !S.devices.some(d => d.id === S.dev)) { S.dev = S.devices.length ? S.devices[0].id : null; if (S.dev && !generalPagesAll.includes(S.page) && S.page !== 'home') S.page = devicePages(S.devices[0])[0]; }
      render();
      seedProfiles();
      await store.loadRest();
      if (S.page === 'about') await loadLogs();
    } catch (e) { S.connected = false; }
    render();
  }

  // the screens (view models in vm/, views in view/): each module gets what it uses from the others
  // a view model changed what is on screen: draw it again
  const changed = () => schedule();
  // every button's command, by its data-act name, from the view models
  const commands = Object.assign({}, ...MODULES.map(m => m.commands || {}));
  const ctx = Object.assign({ commands, changed, $, root, api, store, S, VERSION, call, toast, merge, setSetting, setGeneral, setAssign, loadLogs, refresh }, ...MODULES.map(m => m.provide));
  MODULES.forEach(m => m.link(ctx));
  fxView.linkViews(ctx);
  const { IS_LINUX, IS_MAC, IS_WIN, alignToNav, devicePages, flowEvent, generalPagesAll, go, onAction, onRecordEvent, recording, pairCheck, render, ringEditorOn, ringState, updateCheckAtStart, saveRing, seedProfiles, schedule, homeFit, unhideIfBack } = ctx;
  document.addEventListener('click', () => { if (S.menu) { S.menu = null; changed(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !recording() && ringEditorOn() && (S.ringPath || []).length && S.dlg !== 'prompt' && !/input/i.test((e.target || {}).tagName || '')) { e.stopImmediatePropagation(); onAction('go-home', { dataset: {} }); }
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !S.dlg && S.flowPanel && !root.querySelector('.flow-wiz')) { onAction('flow-panel-close', { dataset: {} }); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !S.dlg && root.querySelector('.flow-wiz')) { onAction('flow-wiz-cancel', { dataset: {} }); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.dlg && !recording()) { S.dlg = S.dlg === 'prompt' && S.prompt && S.prompt.back ? S.prompt.back : null; changed(); } });
  // the mouse's Back and Forward buttons move through the window as its back arrow does: Back closes
  // the sheet, dialog or panel on top first, else steps back; Forward returns to where Back left
  document.addEventListener('mouseup', e => {
    if ((e.button !== 3 && e.button !== 4) || recording()) return;
    e.preventDefault();
    if (e.button === 4) { onAction('nav-forward', { dataset: {} }); return; }
    if (root.querySelector('.flow-wiz')) onAction('flow-wiz-cancel', { dataset: {} });
    else if (S.dlg && !(S.dlg === 'picker' && S.picker && S.picker.drawer)) onAction('close-dlg', { dataset: {} });
    else if (S.flowPanel) onAction('flow-panel-close', { dataset: {} });
    else onAction('nav-back', { dataset: {} });
  });
  document.addEventListener('mousedown', e => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
  // on Home the arrow keys page through the devices when there are more than fit
  document.addEventListener('keydown', e => {
    if (S.page !== 'home' || S.dlg || recording() || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || /input|textarea|select/i.test((e.target || {}).tagName || '')) return;
    const b = root.querySelector(`.home-arrow[data-key="${e.key === 'ArrowLeft' ? -1 : 1}"]:not([disabled])`);
    if (b) { e.preventDefault(); onAction('home-step', b); }
  });
  api.host.onStatus(st => {
    S.connected = !!st.connected;
    if (st.connected) { S.agentBusy = false; S.agentErr = null; refresh(); }
    else { S.devices = []; S.loaded = false; if (st.starting) S.agentBusy = true; changed(); }
  });
  api.host.onBuild(m => { if (m && m.step) { S.buildStep = m.step; S.agentBusy = true; changed(); } });
  // back from the system's Bluetooth settings: the device may be there already
  window.addEventListener('focus', () => pairCheck());
  api.host.onFlowEvent(m => { if (!m) return; store.applyFlow(m); flowEvent(m); });
  // Linux draws the window's rounded corners itself (main/window.js); square while it fills the screen
  api.host.onWindowState(s => document.documentElement.classList.toggle('rounded', !!(s && s.rounded)));
  api.host.onUi(u => { S.ui = u || S.ui; if (S.page === 'settings') changed(); });
  api.host.onBt(m => {
    const p = S.pair, b = p && p.bt;
    if (!b || S.dlg !== 'pair') return;
    if (m.type === 'found') b.list = m.list;
    if (m.type === 'pair') {
      if (m.state === 'connected') { p.step = 3; p.done = t('{name} is connected', { name: m.name }); api.host.btClose(); }
      else b.busy = { address: m.address, name: m.name, state: m.state, passkey: m.passkey, why: m.why };
    }
    render();
  });
  api.host.onEvent(msg => {
    const { event, data } = msg;
    // the Model takes the event; what is on screen decides whether it needs redrawing
    const hit = store.applyEvent(event, data);
    if (hit) {
      if (event === 'device' || event === 'device_added') { if (!S.dev) S.dev = data.id; unhideIfBack(store.device(data.id)); changed(); pairCheck(); }
      else if (event === 'device_removed') { if (S.dev === data.id && S.page !== 'home') { const pairing = S.dlg === 'pair'; go('home'); if (pairing) S.dlg = 'pair'; } changed(); }   // a device leaving does not close Pair a device
      else if (event === 'battery' || event === 'general') changed();
      else if (event === 'profile') { if (S.dev === data.id && S.page !== 'home') changed(); }
      else if (event === 'backlight') { if (S.page === 'backlight') changed(); }
    }
    if (event === 'record') onRecordEvent(data);
    else if (event === 'pair') { if (S.dlg === 'pair') { if (data.status === 'discovering' || data.status === 'found') S.pair.passkey = null; if (data.found) S.pair.found = data.found; if (data.error) S.pair.error = data.error; if (data.passkey) S.pair.passkey = data.passkey; if (data.done) { S.pair.step = 3; S.pair.done = data.done; } if (data.timeout !== undefined) S.pair.timeout = data.timeout; if (data.status === 'cancelled') S.pair.error = S.pair.error || t('Cancelled'); changed(); } }
  });
  render();
  (async () => {
    S.ui = (await api.host.uiSettings()) || {};
    // the theme also lives in the agent-side settings, which survive a rename of the app
    let storedTheme = null; try { storedTheme = localStorage.getItem('theme'); } catch (e) {}
    if (!storedTheme && S.ui.theme) { S.theme = S.ui.theme; try { localStorage.setItem('theme', S.ui.theme); } catch (e) {} }
    S.appInfo = (await api.host.appInfo()) || {};
    updateCheckAtStart();   // in the background: a newer release shows on Home
    if (IS_MAC()) S.ax = await api.host.accessibility(false);
    // while a permission is missing, look again every few seconds: the banner goes as soon as it is granted
    if (IS_MAC()) setInterval(async () => {
      const im = S.status.input_monitoring, need = (S.ax && !S.ax.trusted) || (im && im !== 'granted');
      if (!need) return;
      try { const ax = await api.host.accessibility(false), st = await call('status'); const before = JSON.stringify([S.ax && S.ax.trusted, im]); S.ax = ax; if (st && st.input_monitoring) S.status.input_monitoring = st.input_monitoring; if (JSON.stringify([ax.trusted, S.status.input_monitoring]) !== before) changed(); } catch (e) {}
    }, 4000);
    if (!IS_LINUX() && S.ob.preset === 'gnome') S.ob.preset = IS_WIN() ? 'win' : 'mac';   // the first-run guide starts on this OS's own preset
    try { S.agentInfo = await api.host.agentInfo(); } catch (e) {}
    let onboarded = false; try { onboarded = localStorage.getItem('onboarded') === '1'; } catch (e) {}
    if (!onboarded) S.mode = 'onboard';
    const c = await api.host.connected();
    if (c) { S.connected = true; await refresh(); S.ready = true; changed(); return; }
    // the main process starts the agent on launch; show that rather than a bare "not running"
    S.ready = true; S.agentBusy = true; changed();
    setTimeout(() => { if (!S.connected) { S.agentBusy = false; changed(); } }, 9000);
  })();
})();
