// View: Home, the devices side by side, and the window with no device yet.
import { isMouse } from '../../shared/profiles.mjs';
import { batIcon, known } from '../../shared/battery.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, agentNeedsBuild, batteryState, esc, homeDevices, homePhotoSrc, isOffline, permissionBanners, root, themeMenu;
export function link(ctx) { ({ S, agentNeedsBuild, batteryState, esc, homeDevices, homePhotoSrc, isOffline, permissionBanners, root, themeMenu } = ctx); }

function greeting() { const h = new Date().getHours(); return h < 5 ? t('Good night') : h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening'); }
function pageHome() {
  // a mouse with onboard memory (the PRO X3): a chip on its photo's bottom right switches it, as on G HUB's card
  const onboardChip = (d, off) => {
    if (off || !(d.state || {}).onboard) return '';
    const on = !!(((d.config || {}).settings || {}).onboard_memory);
    return `<button class="onboard-chip ${on ? 'on' : ''}" data-act="home-onboard" data-key="${esc(d.id)}" title="${t('Onboard memory')}: ${on ? t('On') : t('Off')}"><i class="fa-solid fa-microchip"></i></button>`;
  };
  const cards = homeDevices().map(d => {
    const off = isOffline(d);
    const b = d.battery, st = batteryState(b), src = homePhotoSrc(d);
    const hosts = (d.state || {}).hosts, host = hosts && typeof hosts.current === 'number' ? t('host {n}', { n: hosts.current + 1 }) : '';
    const link = ({ bolt: t('Bolt receiver'), lightspeed: t('LIGHTSPEED receiver'), usb: t('USB cable'), bluetooth: 'Bluetooth' }[d.transport] || d.transport || t('Connected')) + (host ? ` · ${host}` : '');
    // photo, battery and state only: the name is in the tooltip, the link is an icon
    const linkIcon = d.transport === 'bluetooth' ? '<i class="fa-brands fa-bluetooth-b"></i>' : '<i class="fa-solid fa-wifi"></i>';
    return `<div class="dev-card ${isMouse(d) ? 'mouse' : 'kbd'} ${off ? 'off' : ''}" data-act="home-open" data-key="${esc(d.id)}" title="${esc(d.name)} · ${off ? t('Not connected') : esc(link)}">
      <div class="dev-photo">${src ? `<span class="photo-box"><img src="${esc(src)}" alt="${esc(d.name)}">${onboardChip(d, off)}</span>` : `<i class="fa-solid ${isMouse(d) ? 'fa-computer-mouse' : 'fa-keyboard'}"></i>`}</div>
      <div class="dev-body centered">
        ${off ? `<div class="dev-inactive"><span class="inactive-tag" title="${t('Not connected')}">${t('Inactive')}</span><button class="inactive-del" data-act="dev-hide" data-key="${esc(d.id)}" title="${t('Remove from NotLogi')}"><i class="fa-solid fa-trash-can"></i></button></div>` : ''}<div class="dev-state ${st.cls}" ${off ? 'hidden' : ''}>${known(b) ? `<span class="dev-pct">${b.percent}%</span>` : ''}<i class="fa-solid ${b ? batIcon(b) : 'fa-battery-empty'}"></i>${b && b.charging ? '<i class="fa-solid fa-bolt dev-bolt"></i>' : ''}${st.label !== t('On battery') ? `<span class="dev-label">${esc(st.label)}</span>` : ''}${d.transport === 'bluetooth' ? `<span class="dev-link bt" title="${esc(link)}">${linkIcon}</span>` : ''}</div>
      </div></div>`;
  }).join('');
  // every device in one row, sharing the width; when they cannot all fit the row scrolls sideways
  // with the arrows (and the arrow keys), which only show then (homeFit, after drawing)
  const arrow = (dir, icon, title) => `<button class="home-arrow ${dir < 0 ? 'prev' : 'next'}" data-act="home-step" data-key="${dir}" title="${title}"><i class="fa-solid ${icon}"></i></button>`;
  return `<div class="home-pager">${arrow(-1, 'fa-arrow-left', t('Previous devices'))}<div class="home-strip">${cards}</div>${arrow(1, 'fa-arrow-right', t('More devices'))}</div>`;
}

// Once drawn: whether the row of devices fits (no arrows) or scrolls, and which arrows can move it.
function homeFit() {
  const pager = root.querySelector('.home-pager'), strip = pager && pager.querySelector('.home-strip');
  if (!strip) return;
  const update = () => {
    const over = strip.scrollWidth > strip.clientWidth + 2;
    pager.classList.toggle('fits', !over);
    const [prev, next] = pager.querySelectorAll('.home-arrow');
    prev.disabled = !over || strip.scrollLeft <= 2;
    next.disabled = !over || strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
  };
  strip.onscroll = update;
  update();
}
// ----------------------------------------------------------- states
function renderEmpty() {
  const c = S.conflicts[0], needsBuild = agentNeedsBuild();
  const booting = !S.ready || (S.connected && !S.loaded);
  // the devices may simply be on the other computer: Flow stays one click away
  const flowBtn = S.flow && (S.flow.peers || []).length ? `<button class="hbtn icon" data-act="page" data-page="flow" title="${t('Flow')}"><i class="fa-solid fa-diagram-project"></i></button>` : '';
  return `<div class="window"><main class="main empty-wrap">
    <header class="hb"><span class="title">NotLogi</span><div class="right">${flowBtn}<div style="position:relative"><button class="hbtn icon" data-act="menu-theme"><i class="fa-solid fa-circle-half-stroke"></i></button>${S.menu === 'theme' ? themeMenu() : ''}</div><button class="hbtn winmin" data-act="win-min" title="${t('Minimize window')}"><i class="fa-solid fa-minus"></i></button><button class="hbtn close" data-act="win-close"><i class="fa-solid fa-xmark"></i></button></div></header>
    ${permissionBanners()}
    ${c ? `<div class="banner"><i class="fa-solid fa-triangle-exclamation"></i><span>${t('<strong>{name} is running.</strong> Two programs diverting the same buttons will fight over the device.', { name: esc(c.name) })}</span><button class="bact" data-act="stop-tool" data-tool="${esc(c.name)}">${t('Stop {name}', { name: esc(c.name) })}</button></div>` : ''}
    <div class="empty"><div class="ring"><i class="${booting || S.agentBusy ? 'fa-solid fa-spinner fa-spin' : S.connected ? 'fa-brands fa-usb' : 'fa-solid fa-power-off'}"></i></div>
      <div class="t">${booting ? t('Looking for devices…') : S.connected ? t('No devices found') : S.agentBusy ? esc(S.buildStep || t('Starting the agent…')) : t('Agent not running')}</div>
      <div class="s">${booting ? t('One moment.') : S.connected
        ? t('Plug in the Bolt or Unifying receiver, or pair over Bluetooth. Devices appear here as soon as they connect.')
        : S.agentBusy
          ? t('This can take a minute the first time. The window connects on its own.')
          : needsBuild
            ? t('The agent has not been compiled yet. The app can do that for you.')
            : `${S.agentErr ? esc(S.agentErr) + '. ' : ''}${t('The agent is the background service that talks to your devices.')}`}</div>
      <div style="display:flex;gap:8px;margin-top:8px">${booting ? '' : S.connected
        ? `<button class="btn primary" data-act="pair"><i class="fa-solid fa-plus"></i>${t('Pair a device')}</button>`
        : S.agentBusy ? '' : `<button class="btn primary" data-act="start-agent"><i class="fa-solid ${needsBuild ? 'fa-hammer' : 'fa-play'}"></i>${needsBuild ? t('Build and start') : t('Start the agent')}</button>`}${booting ? '' : `<button class="btn" data-act="onboard"><i class="fa-solid fa-shield-halved"></i>${t('Setup guide')}</button>`}</div></div></main></div>`;
}

export const provide = { greeting, pageHome, renderEmpty, homeFit };
