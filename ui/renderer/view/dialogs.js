// View: the dialogs: pairing, wishes and problem reports, prompts and confirmations, first run.
import { pctText } from '../../shared/battery.mjs';
import { toolName } from '../../shared/actions.mjs';
import { isMouse } from '../../shared/profiles.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let IS_LINUX, IS_MAC, IS_WIN, S, agentNeedsBuild, card, esc, hasReceiver, row;
export function link(ctx) { ({ IS_LINUX, IS_MAC, IS_WIN, S, agentNeedsBuild, card, esc, hasReceiver, row } = ctx); }

// Bluetooth, the way Windows does it: put the device in pairing mode and it shows up here within
// seconds; Connect pairs, trusts and connects it, showing a keyboard's passkey to type
function btPairBody(p) {
  const b = p.bt || { list: [] };
  const busy = b.busy, list = b.list || [];
  const rows = list.map(d => {
    const mine = busy && busy.address === d.address;
    const right = !mine ? `<button class="btn primary sm" data-act="bt-connect" data-key="${esc(d.address)}" ${busy && busy.state !== 'failed' ? 'disabled' : ''}>${t('Connect')}</button>`
      : busy.state === 'failed' ? `<button class="btn sm" data-act="bt-connect" data-key="${esc(d.address)}">${t('Try again')}</button>`
      : `<span class="bt-wait"><i class="fa-solid fa-spinner fa-spin"></i>${t('Connecting…')}</span>`;
    const sub = mine && busy.state === 'failed' ? `<span class="bt-err">${esc(busy.why || t('Could not connect'))}</span>` : d.kind === 'keyboard' ? t('Keyboard') : t('Mouse');
    return `<div class="bt-dev"><span class="ic"><i class="fa-solid ${d.kind === 'keyboard' ? 'fa-keyboard' : 'fa-computer-mouse'}"></i></span><div class="grow"><div class="nm">${esc(d.name)}</div><div class="sub">${sub}</div></div>${right}</div>`;
  }).join('');
  const passkey = busy && busy.state === 'passkey' ? `<div class="bt-passkey"><div>${t('Type this on <b>{name}</b>, then press Enter', { name: esc(busy.name) })}</div><div class="digits">${esc(busy.passkey)}</div></div>` : '';
  return `<div class="center bt-search"><span class="ring bt-pulse"><i class="fa-brands fa-bluetooth-b"></i></span>
      <div style="font-size:16px;font-weight:600">${list.length ? t('Ready to connect') : t('Put your device in pairing mode')}</div>
      <div class="hint">${t('Hold its Easy-Switch button for 3 seconds until the light blinks fast. It shows up here within a few seconds.')}</div></div>
    ${passkey}<div class="bt-list">${rows || `<div class="bt-empty"><i class="fa-solid fa-satellite-dish"></i>${t('Searching for devices in pairing mode…')}</div>`}</div>
    <div class="hint" style="text-align:center"><a href="#" data-act="open-bt">${t('Use the system Bluetooth settings instead')}</a></div>`;
}
// Bluetooth through the system's settings (macOS, Windows): pair it there, the dialog waits for it to
// arrive; after a while it says what usually keeps a paired device from showing up
function sysWaitBody(p) {
  const im = IS_MAC() && S.status.input_monitoring && S.status.input_monitoring !== 'granted';
  const help = p.sys.slow ? `<div class="pair-help"><div class="ph-t">${t('Paired but not showing up?')}</div>
      ${im ? `<div class="ph-row warn"><i class="fa-solid fa-triangle-exclamation"></i><span class="grow">${t('NotLogi needs Input Monitoring to see your devices.')}</span><button class="btn" data-act="im-open">${t('Open settings')}</button></div>` : ''}
      <div class="ph-row"><i class="fa-solid fa-circle-info"></i><span class="grow">${t('If Logi Options+ is running, quit it: it holds the device.')}</span></div>
      <div class="ph-row"><i class="fa-solid fa-circle-info"></i><span class="grow">${t('Check that the device shows as connected in Bluetooth settings. NotLogi keeps waiting.')}</span></div></div>` : '';
  return `<div class="center"><span class="ring"><i class="fa-brands fa-bluetooth-b"></i></span><div style="font-size:16px;font-weight:600">${t('Pair your device in Bluetooth settings')}</div>
    <div class="hint">${t('Hold its Easy-Switch button for 3 seconds until the light blinks fast, then choose it in Bluetooth settings.')}</div>
    <div class="progress"><i></i></div><div class="hint">${t('Waiting for it to connect…')}</div></div>${help}`;
}
function renderPair() {
  const p = S.pair;
  const steps = [[1, t('Connection')], [2, t('Discover')], [3, t('Done')]].map(([n, l]) => `<button class="${n < p.step ? 'done' : n === p.step ? 'cur' : ''}"><span class="bar"></span><span class="t">${l}</span></button>`).join('');
  let body;
  // with no receiver plugged in the receiver choice is greyed out and Bluetooth is chosen
  if (p.step === 1) body = `<button class="choice ${p.via !== 'bt' ? 'on' : ''}" data-act="pair-via" data-key="bolt" ${hasReceiver() ? '' : `disabled title="${t('Plug in a Bolt or Unifying receiver to pair with it')}"`}><span class="ic"><i class="fa-brands fa-usb"></i></span><div class="grow"><div>${t('Bolt receiver')}</div><div class="sub">${hasReceiver() ? esc(S.status.receivers) : t('No receiver plugged in')}</div></div></button>
    <button class="choice ${p.via === 'bt' ? 'on' : ''}" data-act="pair-via" data-key="bt"><span class="ic"><i class="fa-brands fa-bluetooth-b"></i></span><div class="grow"><div>Bluetooth</div><div class="sub">${IS_LINUX() ? t('Found and connected right here') : t('Via the system Bluetooth settings')}</div></div></button><div class="hint">${t('Unifying receivers are supported for existing pairings only.')}</div>`;
  else if (p.step === 2 && p.sys) body = sysWaitBody(p);
  else if (p.step === 2 && p.via === 'bt') body = btPairBody(p);
  else if (p.step === 2) {
    const f = p.found[0];
    let title = t('Searching…'), hint = t('Turn the device off and on, or hold its Easy-Switch key for 3 seconds until the LED blinks fast.');
    if (p.error) { title = t('Pairing failed'); hint = p.error; }
    else if (p.passkey && f) { title = t('Confirm on {name}', { name: f.name }); hint = (f.authentication & 1) ? t('Type these digits on the keyboard you are pairing, then press Enter.') : t('Click {clicks} on the mouse, then press both buttons together.', { clicks: [...p.passkey].map(c => c === '1' ? t('right') : t('left')).join(', ') }); }
    else if (f) { title = t('Pairing {name}', { name: f.name }); hint = t('Waiting for the device to confirm.'); }
    body = `<div class="center"><span class="ring"><i class="fa-solid ${p.error ? 'fa-triangle-exclamation' : 'fa-satellite-dish'}"></i></span><div style="font-size:16px;font-weight:600">${esc(title)}</div><div class="hint">${esc(hint)}</div>${p.error ? '' : '<div class="progress"><i></i></div>'}${p.passkey && f && (f.authentication & 1) ? `<div class="keys">${[...p.passkey].map(c => `<span>${c}</span>`).join('')}</div>` : ''}${f ? `<div class="choice on" style="max-width:360px"><span class="ic"><i class="fa-solid ${f.kind === 'keyboard' ? 'fa-keyboard' : 'fa-computer-mouse'}"></i></span><div class="grow"><div>${esc(f.name)}</div><div class="sub">${esc(f.kind)}</div></div></div>` : ''}</div>`;
  }
  else body = `<div class="center"><span class="ring ok"><i class="fa-solid fa-check"></i></span><div style="font-size:16px;font-weight:600">${esc(p.done || t('Device paired'))}</div><div class="hint">${t('It will appear in the sidebar in a moment.')}</div></div>`;
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" data-stop>
    <div class="dlg-head">${t('Pair a device')}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body"><div class="steps">${steps}</div>${body}</div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="pair-cancel">${t('Cancel')}</button>${p.step === 2 && p.sys ? `<button class="btn" data-act="pair-bt-again"><i class="fa-brands fa-bluetooth-b"></i>${t('Open Bluetooth settings again')}</button>` : p.step === 2 && p.via === 'bt' ? '' : `<button class="btn primary" data-act="pair-next" ${p.step === 2 && !p.error ? 'disabled' : ''}>${p.step === 3 ? t('Finish') : p.step === 2 ? t('Retry') : t('Continue')}</button>`}</div></div></div></div>`;
}
function renderWish() {
  const w = S.wish || {};
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:560px" data-stop>
    <div class="dlg-head">${t('Make a wish')}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body">
      <label class="hint">${t('Your wish')}<textarea class="text" data-field="wish" rows="5" style="display:block;width:100%;margin-top:4px;resize:vertical;font:inherit" placeholder="${t('I wish NotLogi could…')}">${esc(w.what || '')}</textarea></label>
    </div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="close-dlg">${t('Cancel')}</button><button class="btn primary" data-act="wish-open" ${(w.what || '').trim() ? '' : 'disabled'}><i class="fa-solid fa-arrow-up-right-from-square"></i>${t('Send my wish on GitHub')}</button></div></div></div></div>`;
}
function renderReport() {
  const r = S.report || {};
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:640px" data-stop>
    <div class="dlg-head">${t('Report a problem')}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body">
      <label class="hint">${t('What happened?')}<textarea class="text" data-field="what" rows="3" style="display:block;width:100%;margin-top:4px;resize:vertical;font:inherit" placeholder="${t('What did you do, what did you expect, what happened instead?')}">${esc(r.what || '')}</textarea></label>
      <div class="hint">${t('This is what will be in the issue. Serial numbers, host names and your user name are removed, and custom commands are reduced to their kind.')}</div>
      <pre class="report-pre">${esc(r.summary || t('Gathering…'))}${r.log ? '\n\n--- agent log, last lines ---\n' + esc(r.log) : ''}</pre>
      <div class="hint"><i class="fa-solid fa-circle-info"></i> ${t('Nothing is sent by NotLogi. Your browser opens a new issue on GitHub with this text filled in; it becomes public when you press Submit there.')}</div>
    </div>
    <div class="dlg-foot"><button class="btn flat" data-act="report-copy"><i class="fa-solid fa-copy"></i>${t('Copy')}</button><div class="r"><button class="btn" data-act="close-dlg">${t('Cancel')}</button><button class="btn primary" data-act="report-open" ${r.summary ? '' : 'disabled'}><i class="fa-solid fa-arrow-up-right-from-square"></i>${t('Open issue on GitHub')}</button></div></div></div></div>`;
}
function renderPrompt() {
  const p = S.prompt;
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:460px" data-stop>
    <div class="dlg-head">${esc(p.title)}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body">${p.fields.map(f => `<label class="hint">${esc(f.label)}<input class="text" style="display:block;width:100%;margin-top:4px" data-field="${f.key}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="dl-${f.key}"` : ''}>${f.list ? `<datalist id="dl-${f.key}">${f.list.map(o => `<option value="${esc(o.value)}">${esc(o.label || '')}</option>`).join('')}</datalist>` : ''}</label>`).join('')}${p.note ? `<div class="hint">${p.note}</div>` : ''}</div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="close-dlg">${t('Cancel')}</button><button class="btn primary" data-act="prompt-ok">${esc(p.ok || t('OK'))}</button></div></div></div></div>`;
}
// a yes/no question; the safe answer (Cancel) is the highlighted one
function renderConfirm() {
  const p = S.confirm;
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:440px" data-stop>
    <div class="dlg-head">${esc(p.title)}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body"><div class="hint" style="font-size:14px">${esc(p.text)}</div></div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn" data-act="confirm-ok">${esc(p.ok)}</button><button class="btn primary" data-act="close-dlg" autofocus>${t('Cancel')}</button></div></div></div></div>`;
}
// Remove NotLogi: what goes is listed first (the main process looks), settings only when chosen
function renderUninstall() {
  const u = S.uninstall || {};
  const ITEM = { agent: t('The agent and its login service'), autostart: t('Start at login'), launcher: t('The launcher and icons'), settings: t('Settings, profiles and backups'), package: t('The logimx package (asks for your password)'), appimage: t('The AppImage file'), udev: t('The udev rule (asks for your password)'), login: t('The login item'), permissions: t('Accessibility and Input Monitoring permissions'), app: IS_MAC() ? t('NotLogi goes to the Trash') : t('The Windows uninstaller runs next') };
  const always = ['agent', 'login', 'permissions', 'package', 'app'];
  const items = (u.steps || []).filter(s => s.n > 0 || always.includes(s.id)).map(s => `<li>${ITEM[s.id] || esc(s.id)}</li>`).join('');
  return `<div class="scrim" data-act="close-dlg"><div class="dlg" style="width:480px" data-stop>
    <div class="dlg-head">${t('Remove NotLogi')}<button class="hbtn close" data-act="close-dlg"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="dlg-body"><div class="hint" style="font-size:14px">${t('This takes away:')}</div>
      <ul style="margin:6px 0 14px 18px;padding:0;font-size:14px;line-height:1.7">${items || `<li>${t('Gathering…')}</li>`}</ul>
      ${card(row(t('Also remove my settings, profiles and backups'), u.settings ? '' : t('Kept, a later install finds them again'), `<button class="switch ${u.settings ? 'on' : ''}" data-act="uninstall-settings"></button>`))}</div>
    <div class="dlg-foot"><span></span><div class="r"><button class="btn danger" data-act="uninstall-go" ${u.steps && !u.busy ? '' : 'disabled'}>${u.busy ? t('Removing…') : t('Remove')}</button><button class="btn primary" data-act="close-dlg" autofocus>${t('Cancel')}</button></div></div></div></div>`;
}
// Windows needs nothing granted; macOS needs Accessibility so LogiMX can press keys and buttons,
// and Input Monitoring so it can open a keyboard
function onboardPermissions() {
  const agentOk = S.connected, conf = S.conflicts.length, ax = S.ax || { trusted: true };
  const imOk = !S.status.input_monitoring || S.status.input_monitoring === 'granted';
  const mark = (ok, n) => ok ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : `<span class="mark-n">${n}</span>`;
  return `<div><h1>${IS_MAC() ? t('Permissions') : t('Getting ready')}</h1><div class="lead">${IS_MAC() ? t('NotLogi talks to your devices directly. To press keys and buttons for you, macOS asks you to allow it once.') : t('NotLogi talks to your devices directly. Nothing else needs to be installed.')}</div></div>
    ${card(`<div class="row">${mark(agentOk, 1)}<div class="grow"><div class="lbl">${t('Background agent')}</div><div class="sub">${agentOk ? t('Running') : S.agentBusy ? t('Starting…') : esc(S.agentErr || t('Not running yet'))}</div></div>${agentOk || S.agentBusy ? '' : `<button class="btn sm" data-act="start-agent">${t('Start')}</button>`}</div>
      ${IS_MAC() ? `<div class="row">${mark(ax.trusted, 2)}<div class="grow"><div class="lbl">${t('Accessibility')}</div><div class="sub">${ax.trusted ? t('Allowed') : t('System Settings > Privacy & Security > Accessibility: switch on NotLogi (already on after an update? remove it with − and add it again with +)')}</div></div>${ax.trusted ? '' : `<button class="btn sm" data-act="ax-open">${t('Open settings')}</button>`}</div>` : ''}
      ${IS_MAC() ? `<div class="row">${mark(imOk, 3)}<div class="grow"><div class="lbl">${t('Input Monitoring')}</div><div class="sub">${imOk ? t('Allowed') : ax.trusted ? t('For keyboards. System Settings > Privacy & Security > Input Monitoring: switch on NotLogi') : t('For keyboards. Allowed together with Accessibility above, or asked for right after it')}</div></div>${imOk || !ax.trusted ? '' : `<button class="btn sm" data-act="im-open">${t('Open settings')}</button>`}</div>` : ''}
      <div class="row">${mark(!conf, IS_MAC() ? 4 : 2)}<div class="grow"><div class="lbl">${t('Quit Logi Options+ while NotLogi runs')}</div>${conf ? `<div class="sub">${t('{names} is running', { names: esc(S.conflicts.map(c => toolName(c.name)).join(', ')) })}</div>` : ''}</div>${conf ? `<button class="btn sm" data-act="stop-tool" data-tool="${esc(S.conflicts[0].name)}">${t('Stop')}</button>` : ''}</div>`)}`;
}
function renderOnboard() {
  const o = S.ob;
  const steps = [[1, t('Permissions'), IS_LINUX() ? t('udev rule and uinput') : IS_MAC() ? t('Accessibility, Input Monitoring') : t('Background agent')], [2, t('Devices'), t('Choose what to manage')], [3, t('Preset'), IS_LINUX() ? t('GNOME, macOS or Windows-like') : t('Gestures and the thumb wheel')]].map(([n, l, s]) => `<button class="ob-step ${n === o.step ? 'cur' : n < o.step ? 'done' : ''}" data-act="ob-step" data-key="${n}"><span class="n">${n < o.step ? '✓' : n}</span><div><div class="t">${l}</div><div class="s">${s}</div></div></button>`).join('');
  let body;
  if (o.step === 1 && !IS_LINUX()) body = onboardPermissions();
  else if (o.step === 1) {
    const agentOk = S.connected, devOk = S.devices.length > 0;
    const conf = S.conflicts.length;
    body = `<div><h1>${t('Permissions')}</h1><div class="lead">${t('NotLogi talks to devices over HID and emits keys through uinput. Both need a one-time udev rule.')}</div></div>
      ${card(`<div class="row">${agentOk ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : '<span class="mark-n">1</span>'}<div class="grow"><div class="lbl">${t('Background agent')}</div><div class="sub">${agentOk ? t('Running') : S.agentBusy ? t('Starting…') : esc(S.agentErr || t('Not running yet'))}</div></div>${agentOk || S.agentBusy ? '' : `<button class="btn sm" data-act="start-agent">${agentNeedsBuild() ? t('Build and start') : t('Start now')}</button>`}</div>
        <div class="row">${devOk ? '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>' : '<span class="mark-n">2</span>'}<div class="grow"><div class="lbl">${t('Access to /dev/hidraw* and /dev/uinput')}</div>${devOk ? '' : '<code class="cmd">sudo cp udev/60-logimx.rules /etc/udev/rules.d/ && sudo udevadm control --reload && sudo udevadm trigger</code>'}</div></div>
        <div class="row">${conf ? '<span class="mark-n">3</span>' : '<span class="mark-ok"><i class="fa-solid fa-check"></i></span>'}<div class="grow"><div class="lbl">${t('Stop Solaar or logid while NotLogi runs')}</div>${conf ? `<div class="sub">${t('{names} is running', { names: esc(S.conflicts.map(c => c.name).join(', ')) })}</div>` : ''}</div>${conf ? `<button class="btn sm" data-act="stop-tool" data-tool="${esc(S.conflicts[0].name)}">${t('Stop')}</button>` : ''}</div>`)}
      ${devOk ? '' : `<div><button class="btn primary" data-act="install-udev"><i class="fa-solid fa-shield-halved"></i>${t('Install rule with pkexec')}</button></div>`}`;
  } else if (o.step === 2) {
    body = `<div><h1>${t('Your devices')}</h1><div class="lead">${S.devices.length ? t('Found on the receiver.') : t('No devices yet. Switch a device on or plug in the receiver.')}</div></div>
      ${card(S.devices.map(d => `<div class="row"><span class="mark-ok"><i class="fa-solid fa-check"></i></span><i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'}" style="color:var(--dim)"></i><div class="grow"><div class="lbl">${esc(d.name)}</div><div class="sub">${d.transport === 'bolt' ? 'Bolt' : 'Bluetooth'} · ${t('host {n}', { n: ((d.state || {}).hosts || {}).current + 1 || 1 })}</div></div><span class="val">${pctText(d.battery)}</span></div>`).join('') || row(t('Waiting for devices…'), '', ''))}
      <div><button class="btn" data-act="pair"><i class="fa-solid fa-plus"></i>${t('Pair another device')}</button></div>`;
  } else {
    const presets = [['gnome', 'fa-linux', t('GNOME defaults'), t('Gestures drive Overview and workspaces. F-keys follow the shell.')], ['mac', 'fa-apple', t('macOS-like'), t('Gesture button acts as Mission Control; thumb wheel switches desktops.')], ['win', 'fa-windows', t('Windows-like'), t('Task View on gesture tap, Alt+Tab on swipe; media row unchanged.')]].filter(([k]) => IS_LINUX() || k !== 'gnome')
      .sort((a, b) => (b[0] === (IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome')) - (a[0] === (IS_WIN() ? 'win' : IS_MAC() ? 'mac' : 'gnome')));
    body = `<div><h1>${t('Pick a preset')}</h1><div class="lead">${t('A starting point for buttons, gestures and F-keys. Everything can be changed later.')}</div></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${presets.map(([k, i, n, d]) => `<button class="choice ${o.preset === k ? 'on' : ''}" style="flex-direction:column;align-items:flex-start;gap:8px" data-act="ob-preset" data-key="${k}"><i class="fa-brands ${i}" style="font-size:22px;color:${o.preset === k ? 'var(--acc)' : 'var(--dim)'}"></i><span style="font-weight:600">${n}</span><span class="sub">${d}</span></button>`).join('')}</div>`;
  }
  return `<div class="window"><main class="main"><header class="hb"><span class="title">${t('Welcome to NotLogi')}</span><div class="right"><button class="hbtn close" data-act="ob-close"><i class="fa-solid fa-xmark"></i></button></div></header>
    <div class="onboard"><div class="steps-col">${steps}<div class="hint" style="margin-top:auto">${t('Step {n} of {total}', { n: o.step, total: 3 })}</div></div>
    <div class="ob-body">${body}<div class="ob-foot"><button class="btn" data-act="ob-prev" ${o.step === 1 ? 'disabled' : ''}>${t('Back')}</button><button class="btn primary" data-act="ob-next">${o.step === 3 ? t('Finish') : t('Continue')}</button></div></div></div></main></div>`;
}

export const provide = { btPairBody, renderPair, renderWish, renderReport, renderPrompt, renderConfirm, renderUninstall, onboardPermissions, renderOnboard };
