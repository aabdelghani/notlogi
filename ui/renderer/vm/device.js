// View model: a device's own settings: pointer speed, SmartShift, haptics, backlight, Easy-Switch.
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, api, assignment, call, changed, merge, prompt, setAssign, setSetting, toast;
export function link(ctx) { ({ S, api, assignment, call, changed, merge, prompt, setAssign, setSetting, toast } = ctx); }

// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'dpi': async (it, e, d, key) => { await setSetting(d, ['dpi'], Number(it.value)); return; },
  'pspeed': async (it, e, d, key) => { await setSetting(d, ['pointer_speed'], Number((Number(it.value) / 50 - 1).toFixed(2))); return; },
  'setting': async (it, e, d, key) => { const on = !it.on; const path = it.data.path.split('.'); let v = it.data.on ? (on ? it.data.on : it.data.off) : on; if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = Number(v); await setSetting(d, path, v); changed(); return; },
  'setting-val': async (it, e, d, key) => { const v = it.data.val; await setSetting(d, it.data.path.split('.'), /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v); changed(); return; },
  'setting-range': async (it, e, d, key) => { await setSetting(d, it.data.path.split('.'), Number(it.value)); return; },
  'haptic-level': async (it, e, d, key) => { await setSetting(d, ['haptic', 'level'], Number(it.value)); api.quiet('haptic_play', { id: d.id, waveform: 4 }).catch(() => {}); return; },
  'haptic-play': async (it, e, d, key) => { api.quiet('haptic_play', { id: d.id, waveform: Number(key) }).catch(e => toast(e.message, true)); return; },
  'panel-force-reset': async (it, e, d, key) => { const f = ((d.state || {}).force || [])[0]; if (f) { await setSetting(d, ['panel_force'], f.default); changed(); } return; },
  'bl-reset': async (it, e, d, key) => { const def = (((await api.quiet('defaults', { id: d.id })).settings || {}).backlight) || { enabled: true, mode: 'auto' }; for (const k of ['enabled', 'mode']) if (k in def) await setSetting(d, ['backlight', k], def[k]); await setSetting(d, ['backlight', 'battery_saving'], false); toast(t('Backlighting reset')); changed(); return; },
  'bl-level': async (it, e, d, key) => { await setSetting(d, ['backlight', 'mode'], 'manual'); await setSetting(d, ['backlight', 'level'], Number(key)); changed(); return; },
  'step': async (it, e, d, key) => { const st = (d.state || {}).backlight || {}, s = (d.config.settings || {}).backlight || {}; const v = Math.max(Number(it.data.lo), Math.min(Number(it.data.hi), (s[key] ?? st[key] ?? 0) + Number(it.data.d))); await setSetting(d, ['backlight', key], v); changed(); return; },
  'thumb-speed': async (it, e, d, key) => { const tw = assignment(d, 'thumbwheel'); let a = typeof tw === 'string' ? Object.assign({}, S.presets.all[tw], { preset: tw }) : Object.assign({}, tw || S.presets.all.hscroll); a.gain = Number(it.value) * 1.6; await setAssign(d, 'thumbwheel', '', a); return; },
  'host': async (it, e, d, key) => { await call('change_host', { id: d.id, host: Number(key) }); toast(t('{name}: switching to host {n}', { name: d.name, n: Number(key) + 1 })); return; },
  'rename-host': async (it, e, d, key) => { const h = d.state.hosts.names[Number(key)]; prompt(t('Rename host'), [{ key: 'name', label: t('Name shown on the device'), value: h.name }], async v => { merge(await call('set_host_name', { id: d.id, host: Number(key), name: v.name.trim() })); changed(); }, t('Rename')); return; },
  'sync-device': async (it, e, d, key) => { const dd = S.devices.find(x => x.id === key); try { merge(await call('sync_from_device', { id: key })); toast(t('{name}: settings read from device', { name: dd.name })); } catch (x) { merge(await call('device', { id: key })); } changed(); return; },
};

export const provide = {  };
