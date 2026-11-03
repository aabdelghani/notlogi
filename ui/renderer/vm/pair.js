// View model: pairing a device, with a receiver or over Bluetooth.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let IS_LINUX, S, api, call, changed, devicePages, go, isOffline, toast;
export function link(ctx) { ({ IS_LINUX, S, api, call, changed, devicePages, go, isOffline, toast } = ctx); }

// a receiver is plugged in: only then can a device be paired to one
const hasReceiver = () => !!(S.status && S.status.receivers);
// a receiver of one kind ("Bolt", "Lightspeed") is plugged in: only that kind can take a new device
const hasRecv = kind => !!(S.status && (S.status.receivers || '').split(', ').some(r => r.startsWith(kind + ' ')));
const firstVia = () => hasRecv('Bolt') ? 'bolt' : hasRecv('Lightspeed') ? 'lightspeed' : 'bt';
// Bluetooth on macOS and Windows: the system's own settings pair the device, and this dialog waits for
// it to arrive. The agent is asked to look for new devices every 150 ms meanwhile (it takes up to 15 s
// a request, so the ask is renewed), and after 30 s the dialog says what usually stands in the way.
let sysTimers = [];
function sysStop() { sysTimers.forEach(clearTimeout); sysTimers.forEach(clearInterval); sysTimers = []; }
function sysWait() {
  sysStop();
  const online = S.devices.filter(d => !isOffline(d)).map(d => d.id);
  S.pair.step = 2; S.pair.sys = { known: online, slow: false };
  api.host.openBluetooth();
  // the dialog closed some other way (its ✕, a click outside): stop looking
  const look = () => { if (S.dlg !== 'pair' || !S.pair || !S.pair.sys) { sysStop(); return; } call('expect_device', { ms: 12000 }).catch(() => {}); };
  look();
  sysTimers.push(setInterval(look, 10000));
  sysTimers.push(setTimeout(() => { if (S.pair && S.pair.sys && S.pair.step === 2) { S.pair.sys.slow = true; changed(); } }, 30000));
  changed();
}
// a device the dialog was waiting for has arrived: say so, then open its page
function pairCheck() {
  const p = S.pair, w = p && p.sys;
  if (S.dlg !== 'pair' || !w || p.step !== 2) return;
  const d = S.devices.find(x => !isOffline(x) && !w.known.includes(x.id));
  if (!d) { call('expect_device', { ms: 6000 }).catch(() => {}); return; }
  sysStop();
  p.step = 3; p.done = t('{name} is connected', { name: d.name }); p.arrived = d.id;
  changed();
  sysTimers.push(setTimeout(() => { if (S.dlg === 'pair' && S.pair.arrived === d.id) openArrived(); }, 1600));
}
function openArrived() {
  const id = S.pair.arrived, d = S.devices.find(x => x.id === id);
  S.dlg = null; S.pair = { step: 1, found: [] };
  if (d) go(devicePages(d)[0], id); else changed();
}

// the screen state this view model owns: pairing: its step, what was found, Bluetooth's progress
export const state = {
  pair: { step: 1, found: [] },
};

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'open-bt': async (it, e, d, key) => { api.host.openBluetooth(); toast(t('Opening Bluetooth settings')); return; },
  // with no receiver plugged in, Bluetooth is the only way, and it is chosen already
  'pair': async (it, e, d, key) => { sysStop(); S.pair = { step: 1, found: [], via: firstVia() }; S.dlg = 'pair'; S.menu = null; changed(); return; },
  'pair-via': async (it, e, d, key) => { if ((key === 'bolt' && !hasRecv('Bolt')) || (key === 'lightspeed' && !hasRecv('Lightspeed'))) return; S.pair.via = key; changed(); return; },
  'bt-connect': async (it, e, _d, key) => { const b = S.pair && S.pair.bt; if (!b) return; const d = (b.list || []).find(x => x.address === key); b.busy = { address: key, name: d ? d.name : key, state: 'pairing' }; changed(); api.host.btConnect(key); return; },
  'pair-next': async (it, e, d, key) => {
    // Bluetooth: the dialog's own live search
    if (S.pair.step === 1 && S.pair.via === 'bt' && !IS_LINUX()) { sysWait(); return; }
    if (S.pair.step === 1 && S.pair.via === 'bt') { S.pair.step = 2; S.pair.bt = { list: [] }; changed(); api.host.btOpen().catch(() => {}); return; }
    if (S.pair.step === 1 || (S.pair.step === 2 && S.pair.error)) { S.pair.step = 2; S.pair.error = null; S.pair.found = []; S.pair.passkey = null; changed(); try { await call('pair_start', { via: S.pair.via }); } catch (x) { S.pair.error = x.message || t('Pairing is not available'); changed(); } return; }
    if (S.pair.step === 3 && S.pair.arrived) { sysStop(); openArrived(); return; }
    if (S.pair.step === 3) { if (S.pair.bt) api.host.btClose(); S.dlg = null; changed(); return; }
    return;
  },
  'pair-cancel': async (it, e, d, key) => { sysStop(); call('pair_cancel').catch(() => {}); if (S.pair && S.pair.bt) api.host.btClose(); S.dlg = null; changed(); return; },
  'pair-bt-again': async (it, e, d, key) => { api.host.openBluetooth(); return; },
};

export const provide = { hasReceiver, hasRecv, pairCheck };
