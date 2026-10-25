// View: the general pages: notifications, backup, settings, Flow, About.
import { isMouse } from '../../shared/profiles.mjs';
import { LANGS, t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let ALT, IS_LINUX, IS_MAC, IS_WIN, META, S, THEMES, VERSION, allProfiles, card, esc, flowRefresh, range, row, sec, sw;
export function link(ctx) { ({ ALT, IS_LINUX, IS_MAC, IS_WIN, META, S, THEMES, VERSION, allProfiles, card, esc, flowRefresh, range, row, sec, sw } = ctx); }

function pageNotif() {
  const g = S.general, ev = g.osd_events || { mic: true, smartshift: true, backlight: true, host: true, dpi: false };
  const pos = g.osd_position || 'bottom', dur = g.osd_duration ?? 1500;
  return sec(t('On-screen overlays'), card(row(t('Show overlays'), t('Toast when a diverted key changes device state'), sw(g.osd_enabled ?? true, 'data-act="general" data-key="osd_enabled"')) +
      `<div class="row"><span class="grow lbl">${t('Position')}</span><span class="seg">${['top', 'center', 'bottom'].map(p => `<button class="${pos === p ? 'on' : ''}" data-act="general-val" data-key="osd_position" data-val="${p}">${({ top: t('Top'), center: t('Centre'), bottom: t('Bottom') })[p]}</button>`).join('')}</span></div>` +
      `<div class="row"><span class="grow lbl">${t('Duration')}</span>${range('data-act="general-range" data-key="osd_duration" data-out="dur"', dur, 500, 4000, 250)}<span class="val" data-out="dur" style="width:40px;text-align:right">${t('{n} s', { n: (dur / 1000).toFixed(1) })}</span></div>` +
      row(t('Toggle overlays shortcut'), '', `<span class="val">${META()} + ${ALT()} + O</span>`) +
      `<div class="row"><span class="grow lbl">${t('Preview')}</span>${['mic', 'smartshift', 'backlight', 'host', 'dpi', 'emoji'].map(k => `<button class="btn sm" data-act="osd-test" data-key="${k}">${k}</button>`).join('')}</div>`)) +
    sec(t('Show overlay for'), card([['mic', 'fa-microphone-slash', t('Microphone mute')], ['smartshift', 'fa-gear', t('SmartShift mode')], ['backlight', 'fa-sun', t('Backlight level')], ['host', 'fa-right-left', t('Easy-Switch host')], ['dpi', 'fa-arrow-pointer', t('DPI change')]].map(([k, icon, label]) => `<div class="row"><i class="fa-solid ${icon}" style="width:20px;text-align:center;color:var(--dim)"></i><span class="grow lbl">${label}</span>${sw(ev[k] !== false, `data-act="osd-event" data-key="${k}"`)}</div>`).join(''))) +
    sec(t('System notifications'), card(row(t('Low battery'), '', sw(g.notify_low ?? true, 'data-act="general" data-key="notify_low"')) + row(t('Device connected / disconnected'), '', sw(g.notify_connect ?? false, 'data-act="general" data-key="notify_connect"'))));
}

function pageBackup() {
  const cfg = S.status.config_path || '~/.config/logimx/config.json';
  const n = S.devices.length, np = allProfiles().length;
  return sec(t('Configuration file'), card(row(esc(cfg), (n === 1 ? t('{n} device', { n }) : t('{n} devices', { n })) + ' · ' + (np === 1 ? t('{n} app profile', { n: np }) : t('{n} app profiles', { n: np })), `<button class="btn sm" data-act="show-config"><i class="fa-solid fa-folder-open"></i>${t('Show')}</button>`) +
      `<div class="row" style="gap:8px"><button class="btn" data-act="export"><i class="fa-solid fa-download"></i>${t('Export…')}</button><button class="btn" data-act="import"><i class="fa-solid fa-upload"></i>${t('Import…')}</button><span class="grow"></span><button class="btn danger" data-act="reset-all">${t('Reset all')}</button></div>`)) +
    sec(t('On-board profiles'), card(S.devices.map(d => `<div class="row"><i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'}" style="width:20px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${esc(d.name)}</div><div class="sub" style="color:var(--ok)">${t('Read from device')}</div></div><button class="btn sm" data-act="sync-device" data-key="${d.id}"><i class="fa-solid fa-arrows-rotate"></i>${t('Sync from device')}</button></div>`).join('')) + `<div class="hint">${t('Devices keep DPI, SmartShift and host settings in flash; syncing reads them back into the configuration after using another computer.')}</div>`) +
    sec(t('Backups'), `<div style="display:flex;justify-content:flex-end;margin-bottom:4px"><button class="btn sm" data-act="create-backup"><i class="fa-solid fa-plus"></i>${t('Back up now')}</button></div>` + card(S.backups.length ? S.backups.map(b => `<div class="row"><i class="fa-solid fa-clock-rotate-left" style="width:20px;text-align:center;color:var(--dim)"></i><span class="grow lbl">${esc(b.when)}</span><span class="val">${esc(b.note || '')}</span><button class="btn sm" data-act="restore-backup" data-key="${esc(b.file)}">${t('Restore')}</button></div>`).join('') : row(t('No backups yet'), t('A backup is written before every import and reset'), '')));
}
function pageSettings(generalTitle = t('General')) {
  const u = S.ui || {};
  return sec(t('Startup'), card(row(IS_LINUX() ? t('Start agent at login') : t('Start NotLogi at sign-in'), IS_LINUX() ? t('systemd user service') : IS_WIN() ? t('Starts hidden in the notification area') : t('Login item, starts hidden in the menu bar'), sw(!!u.autostart, 'data-act="ui" data-key="autostart"')) +
      row(IS_MAC() ? t('Show menu bar icon') : t('Show tray indicator'), IS_WIN() ? t('Battery and Easy-Switch in the notification area') : IS_MAC() ? t('Battery and Easy-Switch in the menu bar') : t('Battery and Easy-Switch in the top bar'), sw(u.tray !== false, 'data-act="ui" data-key="tray"')) +
      row(t('Keep running when window closes'), t('Closing hides to the tray'), sw(u.minimize !== false, 'data-act="ui" data-key="minimize"')) +
      row(t('Start hidden'), t('Open in the tray only'), sw(!!u.start_hidden, 'data-act="ui" data-key="start_hidden"')) +
      (IS_LINUX() ? row(t('Notice Bluetooth devices in pairing mode'), t('Like Windows: a notification offers to connect an MX mouse or keyboard as soon as it is ready to pair'), sw(u.bt_watch !== false, 'data-act="ui" data-key="bt_watch"')) : ''))) +
    sec(generalTitle, card(`<div class="row"><span class="grow lbl">${t('Appearance')}</span><select class="sel" data-act="theme-select">${THEMES.map(([k, l]) => `<option value="${k}" ${S.theme === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
      `<div class="row"><div class="grow"><div class="lbl">${t('Window size')}</div><div class="sub">${t('Auto fits the window to the screen')}</div></div><span class="seg">${[['auto', t('Auto')], [0.8, '80%'], [0.9, '90%'], [1, '100%'], [1.1, '110%']].map(([v, l]) => `<button class="${(u.scale ?? 'auto') === v ? 'on' : ''}" data-act="ui-scale" data-val="${v}">${l}</button>`).join('')}</span></div>` +
      // the languages Options+ offers, each named in itself; System follows the desktop's
      `<div class="row"><span class="grow lbl">${t('Language')}</span><select class="sel" data-act="lang-select"><option value="system" ${(S.ui || {}).language ? '' : 'selected'}>${t('System language')}</option>${LANGS.map(([k, l]) => `<option value="${k}" ${(S.ui || {}).language === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` +
      `<div class="row"><div class="grow"><div class="lbl">${t('Check for updates')}</div><div class="sub">${t('Looks at the GitHub release feed')}</div></div><button class="btn sm" data-act="check-updates">${t('Check now')}</button>${sw(u.updates !== false, 'data-act="ui" data-key="updates"')}</div>`)) +
    // the window's other pages, each a row that opens it
    sec(t('More'), card(morePages().map(([p, i, l, sub]) => `<div class="row click" data-act="page" data-page="${p}"><i class="fa-solid ${i}" style="width:20px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${l}</div><div class="sub">${sub}</div></div><i class="fa-solid fa-chevron-right" style="color:var(--dim);font-size:12px"></i></div>`).join('')));
}
const morePages = () => [
  ['notif', 'fa-bell', t('Notifications'), t('On-screen overlays, low battery, devices connecting')],
  ['backup', 'fa-cloud-arrow-down', t('Backup & sync'), t('Back up, restore, export and import settings')],
  ['apps', 'fa-layer-group', t('Profiles'), t('Settings for each application')],
].concat(S.devices.some(isMouse) ? [] : [['ring', 'fa-circle-notch', t('Action ring'), t('Eight actions around the pointer')]],
  [['about', 'fa-circle-info', t('About NotLogi'), t('Version, links, diagnostics')]]);

// Flow: share the mouse, keyboard and clipboard with other computers on the LAN.
// connecting another computer, as Options+ walks through it, over the whole window: this computer and
// the other one side by side, the three things the other one needs (Continue or Cancel), then the search
function flowWizard(step, opening) {
  const f = S.flow || {};
  const art = `<div class="fw-art ${step === 'search' ? 'searching' : ''}">
        <div class="fw-pc me"><i class="fa-solid fa-laptop"></i><span class="n">${t('This computer')}</span>${f.name ? `<span class="h">${esc(f.name)}</span>` : ''}</div>
        <div class="fw-link"><span class="fw-line"></span><i class="fa-solid fa-arrow-pointer fw-ptr"></i></div>
        <div class="fw-pc other"><i class="fa-solid fa-display"></i><span class="n">${t('Other computer')}</span></div>
      </div>`;
  const done = step === 'done', lost = step === 'notfound';
  const body = done || lost
    // the search's end: paired (Flow is on), or nobody found within a minute
    ? `${art.replace('fw-pc other"', done ? 'fw-pc other on"' : 'fw-pc other"')}
      <div class="fw-title">${done ? t('Successfully connected') : t('No computers found. Bummer!')}</div>
      <div class="fw-sub">${done ? t('Flow is now enabled and ready to use on your computers.') : t('We searched everywhere… No computers found on your network. Let’s try again—follow the above steps on other computers.')}</div>
      <div class="fw-btns">${done ? `<button class="btn primary" data-act="flow-wiz-done">${t('Continue')}</button>`
        : `<button class="btn" data-act="flow-wiz-cancel">${t('Cancel')}</button><button class="btn primary" data-act="flow-wiz-go">${t('Try again')}</button>`}</div>`
    : step === 'search'
    // looking for the other computer on the network
    ? `${art}
      <div class="fw-title">${t('Searching for computers')}</div>
      <div class="fw-sub">${t('This process may take up to a minute')}</div>
      <div class="fw-bar"><span></span></div>
      <div class="fw-btns"><button class="btn" data-act="flow-wiz-cancel">${t('Cancel')}</button></div>`
    : `${art}
      <ol class="fw-steps">
        <li><b>1</b><span>${t('Install NotLogi')}</span></li>
        <li><b>2</b><span>${t('Pair your mouse on a different channel')}</span></li>
        <li><b>3</b><span>${t('Connect to the same network')}</span></li>
      </ol>
      <div class="fw-title">${t('Connect other computers')}</div>
      <div class="fw-sub">${t('Follow the above 3 steps on other computers to connect to them via Flow.')}</div>
      <div class="fw-btns"><button class="btn" data-act="flow-wiz-cancel">${t('Cancel')}</button><button class="btn primary" data-act="flow-wiz-go">${t('Continue')}</button></div>`;
  // the window's close button stays where it is (placed over the real one when drawn, see render)
  return `<div class="flow-wiz ${opening ? 'in' : ''}" role="dialog" aria-modal="true"><button class="hbtn winmin fw-min" data-act="win-min" title="${t('Minimize window')}"><i class="fa-solid fa-minus"></i></button><button class="hbtn close fw-close" data-act="win-close" title="${t('Close to tray')}"><i class="fa-solid fa-xmark"></i></button><div class="fw-body step-${step}" ${opening ? '' : 'data-step-in'}>${body}</div></div>`;
}
// the Flow page, as Options+ lays it out: the setup sheet until a computer is paired (see render), then
// the computers drawn as screens where they sit, each with a ⋯ menu; the Flow switch and a settings cog
// at the top right (the cog opens the rest of Flow's settings); Add computer at the bottom
const OS_ICON = { darwin: 'fa-brands fa-apple', win32: 'fa-brands fa-windows', linux: 'fa-brands fa-linux' };
function flowScreen(f, p) {
  const me = !p, open = !me && S.menu === 'flow:' + p.id;
  const icon = me ? OS_ICON[IS_MAC() ? 'darwin' : IS_WIN() ? 'win32' : 'linux'] : (OS_ICON[p.os] || 'fa-solid fa-desktop');
  const status = me ? t('This computer') : p.online ? t('Ready') : t('Not found');
  // another computer: dragged to where its screen sits, its ⋯ removes it
  const more = me ? '' : `<div class="fl-more"><button class="hbtn icon" data-act="flow-menu" data-key="${esc(p.id)}" title="${t('More')}"><i class="fa-solid fa-ellipsis"></i></button>${open ? `<div class="menu fl-menu" data-menu><button class="danger" data-act="flow-remove" data-key="${esc(p.id)}"><i class="fa-solid fa-trash"></i><span>${t('Remove computer')}</span></button></div>` : ''}</div>`;
  return `<div class="fl-screen ${me ? 'me' : ''} ${!me && p.online ? 'on' : ''}" ${me ? '' : `data-peer="${esc(p.id)}"`}>
      <div class="fl-display"><i class="${icon} os"></i><div class="n">${esc(me ? f.name : p.name)}</div><div class="st">${!me ? `<span class="dot ${p.online ? 'ok' : ''}"></span>` : ''}${status}</div>${more}</div>
      <div class="fl-stand"></div>${me ? '' : `<div class="fl-tip"><i class="fa-solid fa-up-down-left-right"></i>${t('Drag the screen to change its position')}</div>`}</div>`;
}
function pageFlow() {
  const f = S.flow;
  if (!f) { flowRefresh(); return ''; }
  const peers = f.peers || [];
  if (!peers.length) return '';
  const at = pos => peers.filter(p => p.pos === pos).map(p => flowScreen(f, p)).join('');
  return `<div class="fl-page">
    <div class="fl-top"><span class="lbl">${t('Flow')}</span>${sw(f.enabled, 'data-act="flow-toggle" data-key="enabled"')}<button class="fl-cog ${S.flowPanel ? 'on' : ''}" data-act="flow-settings" title="${t('Flow Settings')}"><i class="fa-solid fa-gear"></i></button></div>
    <div class="fl-grid">${['up', 'left'].map(pos => `<div class="fg-${pos} fl-slot" data-drop="${pos}">${at(pos)}</div>`).join('')}<div class="fg-me">${flowScreen(f, null)}</div>${['right', 'down'].map(pos => `<div class="fg-${pos} fl-slot" data-drop="${pos}">${at(pos)}</div>`).join('')}</div>
    <div class="fl-bottom"><button class="btn primary fl-add" data-act="flow-add"><i class="fa-solid fa-plus"></i>${t('ADD COMPUTER')}</button>
      ${f.error ? `<div class="hint" style="color:var(--err)">${esc(f.error)}</div>` : ''}</div>
  </div>`;
}
// the rest of Flow's settings, in a panel on the right: how to switch computers, what goes along,
// each device's channel, and NotLogi on other computers of this network
function flowPanel(f) {
  const peers = f.peers || [], near = f.nearby || [];
  const mode = f.switch === 'ctrl' ? 'ctrl' : 'edge';
  const choice = (val, l, sub) => `<button class="row fl-choice ${mode === val ? 'on' : ''}" data-act="flow-switch-mode" data-key="${val}"><span class="radio"></span><div class="grow"><div class="lbl">${l}</div><div class="sub">${sub}</div></div></button>`;
  const channels = peers.map(p => (p.devices || []).map(dv => {
    const auto = dv.from && dv.from !== 'manual' ? (dv.from === 'reported' ? t('Auto: channel {n}, learned', { n: dv.host + 1 }) : t('Auto: channel {n}, from its name', { n: dv.host + 1 })) : t('Auto');
    const opts = [`<option value="auto" ${dv.from !== 'manual' ? 'selected' : ''}>${auto}</option>`].concat(Array.from({ length: dv.count }, (_, i) => `<option value="${i}" ${dv.from === 'manual' && dv.host === i ? 'selected' : ''}>${t('Channel {n}', { n: i + 1 })}</option>`));
    return `<div class="row"><i class="fa-solid ${dv.kind === 'mouse' ? 'fa-computer-mouse' : 'fa-keyboard'}" style="width:22px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${esc(dv.name)}</div><div class="sub">${t('On {computer}', { computer: esc(p.name) })}${dv.host === null ? ' · ' + t('no channel known yet') : ''}</div></div><select class="sel" data-act="flow-channel" data-key="${esc(dv.serial)}" data-peer="${esc(p.id)}" disabled>${opts.join('')}</select></div>`;
  }).join('')).join('');
  const nearRows = near.length ? near.map(n => `<div class="row"><i class="${OS_ICON[n.os] || 'fa-solid fa-desktop'}" style="width:22px;text-align:center;color:var(--dim)"></i><div class="grow"><div class="lbl">${esc(n.name)}</div><div class="sub">${n.searching ? t('Searching for computers') : t('Open Flow on it and choose Add computer to connect')}</div></div>${n.searching ? `<button class="btn sm primary" data-act="flow-connect" data-key="${esc(n.id)}">${t('Connect')}</button>` : ''}</div>`).join('')
    : `<div class="row sub" style="color:var(--dim)">${t('No other computer with NotLogi on this network right now')}</div>`;
  return `<div class="drawer-wrap"><div class="dlg drawer bl-panel" data-stop>
    <div class="dlg-head"><span class="dh-key">${t('Modify settings')}</span><span class="dh-sub">${t('Flow')}</span></div>
    <div class="dlg-body">
      ${sec(t('Switch computers'), card(choice('edge', t('Move cursor to edge'), t('Switch as soon as the pointer reaches the edge of the screen')) + choice('ctrl', t('Hold CTRL and move cursor to edge'), t('The edge only switches while a Ctrl key is held'))))}
      ${sec(t('Sharing'), card(
        row(t('Link keyboard'), t('Your keyboard follows the pointer from one computer to the other'), sw(f.keyboard, 'data-act="flow-toggle" data-key="keyboard"')) +
        row(t('Share clipboard'), t('Copy on one computer, paste on another'), sw(f.clipboard, 'data-act="flow-toggle" data-key="clipboard"'))))}
      ${channels ? `<div id="fl-channels" class="fl-muted">${sec(t('Channels'), card(channels) + `<div class="hint">${t('A device follows the pointer on the channel it is paired on with that computer. Auto learns it when the device connects there with NotLogi running.')}</div>`)}</div>` : ''}
      ${sec(t('Computers on this network'), card(nearRows))}
    </div></div>`;
}

function pageAbout() {
  const links = [['fa-book', t('Documentation'), 'https://github.com/aabdelghani/notlogi#readme'], ['fa-code-branch', t('Source code'), 'https://github.com/aabdelghani/notlogi'], ['fa-bug', t('Report an issue'), 'https://github.com/aabdelghani/notlogi/issues'], ['fa-heart', t('Contributors'), 'https://github.com/aabdelghani/notlogi/graphs/contributors']];
  const logs = S.logs.length ? S.logs : [{ t: `${new Date().toLocaleTimeString()} INFO  agent ${S.connected ? 'connected' : 'not running'} · ${S.devices.length} device(s) · tracker ${S.status.tracker || 'n/a'}`, c: 'dim' }];
  return `<div class="card about-hero"><span class="mark logo"><img class="logo-light" src="../assets/icon.png" alt=""><img class="logo-dark" src="../assets/icon-dark.png" alt=""></span><div class="name">NotLogi</div><div class="tagline">${t('Unofficial mouse &amp; keyboard tools for {os}', { os: IS_WIN() ? 'Windows' : IS_MAC() ? 'macOS' : 'Linux' })}</div><div class="tags"><span>v${S.status.version || VERSION}</span><span title="${t('Free software under the GNU GPL, version 3 or later')}">GPL-3.0</span><span>${S.appInfo.packaged ? t('Packaged') : t('Source')}</span>${IS_LINUX() ? '' : `<span>${t('Beta')}</span>`}</div></div>` +
    card(links.map(([i, l, u]) => `<div class="row click" data-act="open" data-url="${u}"><i class="fa-solid ${i}" style="width:20px;text-align:center;color:var(--dim)"></i><span class="grow lbl">${l}</span><i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--dim);font-size:11px"></i></div>`).join('')) +
    sec(t('Diagnostics'), card(`<div class="logs">${logs.map(l => `<span class="${l.c || 'dim'}">${esc(l.t)}</span>`).join('')}</div>`) + `<div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" data-act="report"><i class="fa-solid fa-bug"></i>${t('Report a problem')}</button><button class="btn" data-act="export-diag"><i class="fa-solid fa-file-zipper"></i>${t('Export diagnostics')}</button><button class="btn" data-act="copy-diag"><i class="fa-solid fa-copy"></i>${t('Copy')}</button></div>`, `<button class="btn sm flat" data-act="refresh-logs">${t('Refresh')}</button>`) +
    sec(t('Remove NotLogi'), card(row(t('Remove from this computer'), t('The app, the agent and everything they set up on this computer'), `<button class="btn danger" data-act="uninstall">${t('Remove…')}</button>`)));
}

export const provide = { flowPanel, flowWizard, pageNotif, pageBackup, pageSettings, pageFlow, pageAbout };
