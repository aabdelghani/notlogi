// View: what every device has: Easy-Switch, battery and information, its settings page.
import { isMouse } from '../../shared/profiles.mjs';
import { batIcon, known, pctText, isLow } from '../../shared/battery.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let ALT, photoOf, META, MOUSE_BOTTOMS, MOUSE_PHOTOS, S, card, chk, esc, isOffline, range, row, sec, sw, isGaming, gamingBattery, gamingSettings;
export function link(ctx) { ({ ALT, photoOf, META, MOUSE_BOTTOMS, MOUSE_PHOTOS, S, card, chk, esc, isOffline, range, row, sec, sw, isGaming, gamingBattery, gamingSettings } = ctx); }

// a computer slot: its name, whether it is the one in use, and how it is linked
function hostInfo(h, i) {
  const n = h.names[i] || { index: i, paired: false, name: '', bus_type: 0 };
  const cur = h.current === i, empty = !n.paired;
  const bus = n.bus_type === 1 ? ['fa-usb', t('Bolt receiver')] : n.bus_type === 2 || n.bus_type === 3 ? ['fa-bluetooth-b', t('Bluetooth')] : empty ? ['fa-link-slash', t('Not paired')] : ['fa-usb', t('Receiver')];
  return { n, cur, empty, bus, name: n.name || (empty ? t('Empty slot') : t('Unnamed computer')), state: cur ? t('Connected') : empty ? t('Empty') : t('Paired') };
}
// The mouse turned over, laid out like Buttons: a ring on each printed number of the Easy-Switch
// button, with the computer on that channel named beside it; a ring opens that computer's panel
function easyPhoto(d) {
  const P = MOUSE_BOTTOMS[d.id], h = d.state.hosts;
  const on = i => backlightPanel(d) && S.esSel === i;
  const spots = P.hosts.map(([i, x, y]) => `<g class="hotspot ms es ${h.current === i ? 'cur' : ''} ${on(i) ? 'selected' : ''}" data-cid="${i}"><circle class="ring" cx="${x}" cy="${y}" r="16"/></g>`).join('');
  const GAP = 150, place = {};
  for (const side of ['l', 'r']) {
    let prev = -Infinity;
    P.hosts.filter(s => s[3] === side).sort((p, q) => p[2] - q[2]).forEach(([i, , y]) => { const ly = Math.max(y, prev + GAP); place[i] = ly; prev = ly; });
  }
  const lines = P.hosts.map(([i, x, y, side]) => `<polyline class="ms-line ${on(i) ? 'on' : ''}" points="${side === 'l' ? x - 16 : x + 16},${y} ${side === 'l' ? -20 : P.w + 20},${place[i]}"/>`).join('');
  const labels = P.hosts.map(([i, , , side]) => {
    const hi = hostInfo(h, i);
    return `<div class="ms-lab es-lab ${side} ${on(i) ? 'on' : ''} ${hi.cur ? 'custom' : ''}" data-ring="${i}" style="top:${(place[i] / P.h * 100).toFixed(2)}%"><span class="k">${hi.state}</span><span class="d"><b class="es-n">${i + 1}</b>${esc(hi.name)}</span></div>`;
  }).join('');
  return `<svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${spots}</svg>${labels}`;
}
// The keyboard's Easy-Switch keys outlined on its photo, the computer on each named above it; the
// names fan out so three neighbouring keys still get readable labels
function keyboardEasyPhoto(d) {
  const P = photoOf(d.id), h = d.state.hosts;
  const on = i => backlightPanel(d) && S.esSel === i;
  // stacked above and to the left of the keys, one row each (1 nearest the keyboard), so the names
  // never collide however narrow the page gets; each row's line runs down to its key
  const lx = P.hosts[0][1] - 110, ly = i => -70 - i * 140;
  const keys = P.hosts.map(([i, x, y]) => `<g class="hotspot kb-es es ${h.current === i ? 'cur' : ''} ${on(i) ? 'selected' : ''}" data-cid="${i}"><rect x="${x - P.kw / 2}" y="${y - P.kh / 2}" width="${P.kw}" height="${P.kh}" rx="14"/></g>`).join('');
  const lines = P.hosts.map(([i, x, y]) => `<polyline class="ms-line ${on(i) ? 'on' : ''}" points="${x},${y - P.kh / 2} ${x},${ly(i)} ${lx},${ly(i)}"/>`).join('');
  const labels = P.hosts.map(([i]) => {
    const hi = hostInfo(h, i);
    return `<div class="ms-lab es-lab kbl ${on(i) ? 'on' : ''} ${hi.cur ? 'custom' : ''}" data-ring="${i}" style="left:${(lx / P.w * 100).toFixed(2)}%;top:${(ly(i) / P.h * 100).toFixed(2)}%"><span class="k">${hi.state}</span><span class="d"><b class="es-n">${i + 1}</b>${esc(hi.name)}</span></div>`;
  }).join('');
  return `<div class="es-kbwrap"><svg viewBox="0 0 ${P.w} ${P.h}"><image href="${P.src}" width="${P.w}" height="${P.h}"/>${lines}${keys}</svg>${labels}</div>`;
}
// the computer picked on the photo: switch to it, pair, rename; and switching for every device at once
function renderEasyPanel(d) {
  const h = d.state.hosts, i = S.esSel ?? h.current, hi = hostInfo(h, i);
  const acts = hi.cur ? '' : hi.empty ? `<button class="btn primary" data-act="pair"><i class="fa-solid fa-plus"></i>${t('Pair a computer…')}</button>`
    : `<button class="btn primary" data-act="host" data-key="${i}"><i class="fa-solid fa-right-left"></i>${t('Switch to this computer')}</button>`;
  const body = card(row(t('Name'), '', `<span class="val">${esc(hi.name)}</span>${hi.empty ? '' : `<button class="btn sm" data-act="rename-host" data-key="${i}" title="${t('Rename')}"><i class="fa-solid fa-pen"></i></button>`}`) +
      row(t('Status'), '', `<span class="val">${hi.state}</span>`) +
      row(t('Connection'), '', `<span class="val"><i class="fa-${hi.bus[0] === 'fa-bluetooth-b' || hi.bus[0] === 'fa-usb' ? 'brands' : 'solid'} ${hi.bus[0]}"></i> ${hi.bus[1]}</span>`)) +
    (acts ? `<div style="margin-top:12px">${acts}</div>` : '') +
    sec(t('All devices'), card(row(t('Linked switching'), t('Move all devices to the same computer together'), sw(!!S.general.linked_easy_switch, 'data-act="general" data-key="linked_easy_switch"')) +
      row(t('Keyboard shortcut'), '', `<span class="val">${META()} + ${ALT()} + 1…3</span>`)));
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">${t('Computer {n}', { n: i + 1 })}</span><span class="dh-sub">${t('Easy-Switch')}</span></div>
    <div class="dlg-body">${body}</div>
  </div></div>`;
}
function pageEasy(d) {
  const h = (d.state || {}).hosts;
  if (!h) return sec(t('Easy-Switch'), card(row(t('Not supported by this device'), '', '')));
  if (easyView(d)) return isMouse(d) ? `<div class="photo-card ms-photo es-photo">${easyPhoto(d)}</div>` : `<div class="kb-photo es-kbp">${keyboardEasyPhoto(d)}</div>`;
  const cards = [0, 1, 2].map(i => {
    const n = h.names[i] || { index: i, paired: false, name: '', bus_type: 0 };
    const cur = h.current === i, empty = !n.paired;
    const bus = n.bus_type === 1 ? ['fa-usb', t('Bolt receiver')] : n.bus_type === 2 || n.bus_type === 3 ? ['fa-bluetooth-b', t('Bluetooth')] : empty ? ['fa-link-slash', t('Not paired')] : ['fa-usb', t('Receiver')];
    return `<div class="host ${cur ? 'cur' : ''}"><div class="top"><span class="n">${i + 1}</span><span class="st">${cur ? t('Connected') : empty ? '' : t('Paired')}</span></div>
      <div class="name">${esc(n.name || (empty ? t('Empty slot') : t('Unnamed host')))}</div>
      <div class="conn"><i class="fa-${bus[0] === 'fa-bluetooth-b' || bus[0] === 'fa-usb' ? 'brands' : 'solid'} ${bus[0]}"></i>${bus[1]}</div>
      <div class="hacts">${cur ? `<button class="btn sm flat" disabled>${t('Current')}</button>` : empty ? `<button class="btn sm" data-act="pair">${t('Pair…')}</button>` : `<button class="btn sm primary" data-act="host" data-key="${i}">${t('Switch')}</button>`}${empty ? '' : `<button class="btn sm" data-act="rename-host" data-key="${i}" title="${t('Rename')}"><i class="fa-solid fa-pen"></i></button>`}</div></div>`;
  }).join('');
  return sec(`${t('Hosts')} · ${esc(d.name)}`, `<div class="hosts">${cards}</div>`) +
    `<div class="easy-opts">` + card(row(t('Linked switching'), t('Move all devices to the same host together'), sw(!!S.general.linked_easy_switch, 'data-act="general" data-key="linked_easy_switch"')) +
      row(t('Keyboard shortcut'), t('Switch host from the tray or with a shortcut'), `<span class="val">${META()} + ${ALT()} + 1…3</span>`)) + `</div>`;
}

function pageInfo(d) {
  const b = d.battery || { percent: 0 }; const hist = S.history[d.id] || [];
  const bars = (hist.length ? hist : known(b) ? [b.percent] : []).slice(-14);
  const rows = [[t('Model'), d.name], [t('Connection'), ({ bolt: t('Bolt receiver'), lightspeed: t('LIGHTSPEED receiver'), usb: t('USB cable') }[d.transport] || t('Bluetooth')) + (((d.state || {}).hosts || {}).count ? ` · ${t('host {n}', { n: d.state.hosts.current + 1 || 1 })}` : '')], [t('Firmware'), d.firmware || t('n/a')]].concat(d.receiver_firmware ? [[t('Receiver firmware'), d.receiver_firmware]] : [], [ [t('Serial'), d.serial || t('n/a')], [t('Protocol'), 'HID++ 2.0'], [t('Wireless PID'), d.id.toUpperCase()]]);
  const est = b.charging ? t('Charging over USB-C') : b.level ? t('Level: {level}', { level: b.level }) : '';
  const thr = S.general.notify_low_threshold ?? 20;
  return `<div class="grid2">
    <div class="card pad" style="display:flex;flex-direction:column;gap:8px"><div class="sec-title"><span>${t('Battery')}</span><span class="meta" style="color:var(--ok)">${b.charging ? t('Charging') : t('Discharging')}</span></div><div class="big">${known(b) ? b.percent + '%' : b.charging ? t('Charging') : t('n/a')}</div>${known(b) ? `<div class="meter ${isLow(b, 10) ? 'crit' : isLow(b) ? 'low' : ''}"><i style="width:${b.percent}%"></i></div>` : ''}<div class="hint">${esc(est)}</div></div>
    <div class="card pad" style="display:flex;flex-direction:column;gap:8px"><div class="sec-title"><span>${t('Last 7 days')}</span></div><div class="hist">${bars.map(v => `<span style="height:${v}%" title="${v}%"></span>`).join('')}</div><div style="display:flex;justify-content:space-between" class="hint"><span>${hist.length > 1 ? t('Earlier') : ''}</span><span>${t('Today')}</span></div></div></div>` +
    (isGaming(d) ? gamingBattery(d) + gamingSettings(d) : '') +
    sec(t('Device'), card(rows.map(([k, v]) => `<div class="row"><span class="grow lbl">${k}</span><span class="val">${esc(v)}</span></div>`).join(''))) +
    sec(t('Alerts'), card(`<div class="row"><div class="grow"><div class="lbl">${t('Low battery warning')}</div><div class="sub">${t('Notify at')}</div></div>${range('data-act="general-range" data-key="notify_low_threshold" data-out="thr"', thr, 5, 50, 5)}<span class="val" data-out="thr" style="width:32px;text-align:right">${thr}%</span></div>`));
}
// ----------------------------------------------------------- home
// The first thing seen: every connected device with its photo, its battery and whether it is
// charging, how it is connected and which profile it is using. A card opens its device.
const devicePhotoSrc = d => ((isMouse(d) ? MOUSE_PHOTOS[d.id] : photoOf(d.id)) || {}).src;
// Home shows a mouse from above; its own view shows it from the side with the buttons numbered
const TOP_VIEWS = { b034: 'b034-top.png', b035: 'b034-top.png', b043: 'b034-top.png', b042: 'b042-top.png', b048: 'b042-top.png', b037: 'b037-top.png' };
const homePhotoSrc = d => isMouse(d) && TOP_VIEWS[d.id] ? '../assets/devices/' + TOP_VIEWS[d.id] : devicePhotoSrc(d);
// the foot of the device's page list: battery icon and percentage on a pill, which opens Battery & info
function navBattery(d) {
  // not connected: changes are kept and reach the device when it is back
  if (isOffline(d)) return `<div class="dnav-bat offline" title="${t('Changes are saved and applied when it reconnects')}"><i class="fa-solid fa-link-slash"></i><span>${t('Not connected')}</span></div>`;
  const b = d.battery, st = batteryState(b);
  return `<div class="dnav-bat ${b ? st.cls : 'none'}" title="${esc(st.label)}"><i class="fa-solid ${b ? batIcon(b) : 'fa-battery-empty'}"></i>${b ? `<span>${pctText(b) || (b.charging ? t('Charging') : t('Info'))}</span>` : `<span>${t('Info')}</span>`}${b && b.charging ? '<i class="fa-solid fa-bolt"></i>' : ''}</div>`;
}
function batteryState(b) {
  if (!b) return { label: t('Battery not reported'), cls: '', icon: 'fa-battery-empty' };
  const plugged = b.charging || b.external_power;
  if (plugged && (b.percent >= 100 || b.level === 'full') && !b.charging) return { label: t('Fully charged, unplug when you like'), cls: 'ok', icon: 'fa-plug-circle-check' };
  if (b.charging) return { label: t('Charging'), cls: 'ok charging', icon: 'fa-bolt' };
  if (!known(b)) return { label: b.external_power ? t('Plugged in') : t('Level not reported'), cls: '', icon: batIcon(b) };
  if (b.percent <= 10) return { label: t('Low, charge soon'), cls: 'err', icon: 'fa-battery-empty' };
  if (b.percent <= 20) return { label: t('Getting low'), cls: 'warn', icon: 'fa-battery-quarter' };
  return { label: t('On battery'), cls: 'ok', icon: batIcon(b) };
}
// the device's own settings, as Options+ lists them: General, the keys it can switch off, backup
const DISABLE_KEYS = [['num_lock', 0x02, 'Num Lock'], ['caps_lock', 0x01, 'Caps Lock'], ['scroll_lock', 0x04, 'Scroll Lock'], ['insert', 0x08, 'Insert'], ['win', 0x10, t('Windows / Start key')]];
function pageDeviceSettings(d) {
  const st = d.state || {}, s = d.config.settings || {}, dk = st.disable_keys, ks = s.disable_keys || {};
  const general = (typeof st.fn_swap === 'boolean' ? row(t('Use F1, F2, etc. keys as standard function keys'), t('Hold Fn for the printed functions'), sw(!(s.fn_swap ?? st.fn_swap), 'data-act="setting" data-path="fn_swap" data-on="false" data-off="true"')) : '') +
    (st.platform ? row(t('Always keep the keyboard layout'), t('The keyboard stops switching its layout by itself'), sw(!!s.keep_layout, 'data-act="setting" data-path="keep_layout"')) : '');
  const keys = dk ? DISABLE_KEYS.filter(([, bit]) => dk.supported & bit).map(([k, bit, l]) => row(l, '', chk(ks[k] ?? !!(dk.disabled & bit), `data-act="setting" data-path="disable_keys.${k}" title="${t('Disable {key}', { key: esc(l) })}"`))).join('') : '';
  const backup = row(t('Back up settings'), t('Save NotLogi settings for all devices to a file'), `<button class="btn sm" data-act="export"><i class="fa-solid fa-download"></i>${t('Save…')}</button>`) +
    row(t('Restore settings'), t('Load settings saved earlier'), `<button class="btn sm" data-act="import"><i class="fa-solid fa-upload"></i>${t('Restore…')}</button>`) +
    row(t('Read from device'), t('Settings kept in the device\'s memory'), `<button class="btn sm" data-act="sync-device" data-key="${esc(d.id)}"><i class="fa-solid fa-arrows-rotate"></i>${t('Sync')}</button>`);
  return (general ? sec(t('General'), card(general)) : '') + (keys ? sec(t('Disabled keys'), card(keys), t('switched off while on')) : '') + sec(t('Device backup'), card(backup));
}

const easyView = d => !!(d && (d.state || {}).hosts && (isMouse(d) ? MOUSE_BOTTOMS[d.id] : (photoOf(d.id) || {}).hosts));
const backlightPanel = d => !!(d && !S.blClosed && !S.appDetail && !S.previewProfile && ((S.page === 'backlight' && !isMouse(d) && (d.state || {}).backlight && photoOf(d.id)) || (S.page === 'pointer' && isMouse(d) && MOUSE_PHOTOS[d.id]) || (S.page === 'easy' && easyView(d)) || (S.page === 'hits' && isGaming(d) && S.hitsPanel)));
export const provide = { hostInfo, easyPhoto, keyboardEasyPhoto, renderEasyPanel, pageEasy, pageInfo, devicePhotoSrc, TOP_VIEWS, homePhotoSrc, navBattery, batteryState, DISABLE_KEYS, pageDeviceSettings, easyView, backlightPanel };
