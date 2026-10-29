// View: draws the whole window from the state, then wires the drawn page to the view models'
// commands; plus the moves between pages (the panel sliding in, the keyboard gliding).
import { isMouse } from '../../shared/profiles.mjs';
import { toolName } from '../../shared/actions.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let PAGES, S, VERSION, appIcon, armRecorder, assignTyped, backlightPanel, bindBarHover, dev, devicePages, dialogClosed, drawerUp, easyView, flowPanel, flowWizard, esc, fmtOut, gestureDrag, go, greeting, homeFit, icons, navBattery, navPages, onAction, openPicker, pageAbout, pageAppDetail, pageApps, pageBacklight, pageBackup, pageButtons, pageDeviceSettings, pageEasy, pageFlow, pageGestures, pageGuard, pageHaptics, pageHome, pageInfo, pageKeys, pageNotif, pagePointer, pageRing, pageSettings, profileBar, recorderActive, renderAddPanel, renderAppList, renderBacklightPanel, renderConfirm, renderEasyPanel, renderEmpty, renderOnboard, renderPair, renderPicker, renderPickerList, renderPointerPanel, renderPrompt, renderReport, renderUninstall, renderWish, ringDrag, ringFolder, ringProfileBar, ringState, ringTop, root, saveFolderName, setChord, setField, sidePanelClosed, stopRecorder, pageDpi, pageWheel, pageHits, renderGamingDialog, hitsTestClick, keymapClick, dpiTestClick, macroKey, renderHitsPanel, renderWheelPanel;
export function link(ctx) { ({ PAGES, S, VERSION, appIcon, armRecorder, assignTyped, backlightPanel, bindBarHover, dev, devicePages, dialogClosed, drawerUp, easyView, flowPanel, flowWizard, esc, fmtOut, gestureDrag, go, greeting, homeFit, icons, navBattery, navPages, onAction, openPicker, pageAbout, pageAppDetail, pageApps, pageBacklight, pageBackup, pageButtons, pageDeviceSettings, pageEasy, pageFlow, pageGestures, pageGuard, pageHaptics, pageHome, pageInfo, pageKeys, pageNotif, pagePointer, pageRing, pageSettings, profileBar, recorderActive, renderAddPanel, renderAppList, renderBacklightPanel, renderConfirm, renderEasyPanel, renderEmpty, renderOnboard, renderPair, renderPicker, renderPickerList, renderPointerPanel, renderPrompt, renderReport, renderUninstall, renderWish, ringDrag, ringFolder, ringProfileBar, ringState, ringTop, root, saveFolderName, setChord, setField, sidePanelClosed, stopRecorder, pageDpi, pageWheel, pageHits, renderGamingDialog, hitsTestClick, keymapClick, dpiTestClick, macroKey, renderHitsPanel, renderWheelPanel } = ctx); }

// ============================================================ render
// Animations run when something new appears, not on every refresh: the page when it is
// navigated to, the dialog when it opens. A refresh of the same page redraws it in place.
let lastWiz = false, lastPageKey = null, lastDlg = null, lastNavKey = null, lastDrawer = false;
// A field being typed into survives a redraw (a battery tick, the focused app changing): the same
// text, the same caret, still focused. Fields are known by their data-field or as the folder's name.
function typingIn() {
  const ae = document.activeElement;
  if (!ae || !root.contains(ae) || !/^(INPUT|TEXTAREA)$/.test(ae.tagName) || ae.type === 'range') return null;
  const sel = ae.classList.contains('folder-name') ? '.folder-name' : ae.dataset.field ? `[data-field="${ae.dataset.field}"]` : null;
  return sel && { sel, v: ae.value, a: ae.selectionStart, b: ae.selectionEnd };
}
function keepTyping(t) {
  if (!t || (document.activeElement && root.contains(document.activeElement) && document.activeElement !== document.body)) return;
  const n = root.querySelector(t.sel); if (!n) return;
  n.value = t.v; n.dataset.keep = '1'; n.focus();
  try { n.setSelectionRange(t.a, t.b); } catch (e) {}
}
// what the view models ask for: one redraw at the next frame, however many changes came first (a
// hidden window gets no frames, so a timer stands in for them)
let dirty = false, queued = false;
function schedule() {
  dirty = true;
  if (queued) return;
  queued = true;
  const run = () => { if (!queued) return; queued = false; if (dirty) render(); };
  requestAnimationFrame(run); setTimeout(run, 50);
}
function render() {
  dirty = false;
  stopRecorder();
  pageGuard();
  document.documentElement.setAttribute('data-theme', S.theme);
  const pageKey = `${S.mode}|${S.page}|${S.dev}|${S.appDetail ? S.appDetail.key : ''}|${S.devices.length ? 1 : 0}`;
  const pageChanged = pageKey !== lastPageKey; lastPageKey = pageKey;
  // coming back to the panel from a prompt over it is not a new opening
  const dlgOpened = !!S.dlg && S.dlg !== lastDlg && !(S.dlg === 'picker' && lastDlg === 'prompt'); lastDlg = S.dlg;
  let html;
  if (S.mode === 'onboard') html = renderOnboard();
  else if (!S.devices.length && S.page !== 'flow' && S.page !== 'ring') html = renderEmpty();   // Flow and the action ring stay reachable while the devices are on another computer
  else html = renderWindow();
  html += renderDialog();
  // the Flow sheet slides up once, when it opens, not on every redraw (nor between its steps)
  const wiz = S.flowWizard || (S.mode !== 'onboard' && S.page === 'flow' && S.flow && !(S.flow.peers || []).length ? 'setup' : false);
  if (wiz) html += flowWizard(wiz, !lastWiz);
  lastWiz = !!wiz;
  // a key's panel or a settings panel (Backlight, Point & scroll): either one sends the page list out
  const panelOn = () => !!(drawerUp()) || (S.page !== 'home' && (S.addPanel || backlightPanel(dev()) || (S.page === 'flow' && !!S.flowPanel)));
  const drawerWill = panelOn();
  const moving = drawerWill !== lastDrawer ? root.querySelector('.dev-config .content > .page > :first-child') : null;
  const from = moving ? moving.getBoundingClientRect() : null;
  // the folder's name being typed survives a redraw (a battery or focus update): same text, same caret
  const typing = typingIn();
  // the same page drawn again (what it shows arrived, a battery update) stays scrolled where it was
  const SCROLLERS = '.content, .dlg-body', kept = pageChanged ? [] : [...root.querySelectorAll(SCROLLERS)].map(e => e.scrollTop);
  root.innerHTML = html;
  if (kept.some(Boolean)) root.querySelectorAll(SCROLLERS).forEach((e, i) => { if (kept[i]) e.scrollTop = kept[i]; });
  // the Flow sheet's close button sits exactly over the window's own, which the sheet covers
  const fwClose = root.querySelector('.fw-close'), winClose = fwClose && root.querySelector('.hbtn.close:not(.fw-close)');
  if (winClose) { const r = winClose.getBoundingClientRect(); fwClose.style.top = r.top + 'px'; fwClose.style.right = (window.innerWidth - r.right) + 'px'; }
  // and its minimize button over the window's own
  const fwMin = root.querySelector('.fw-min'), winMin = fwMin && root.querySelector('.hbtn.winmin:not(.fw-min)');
  if (winMin) { const r = winMin.getBoundingClientRect(); fwMin.style.top = r.top + 'px'; fwMin.style.right = (window.innerWidth - r.right) + 'px'; }
  if (pageChanged) { const pg = root.querySelector('.content > .page'); if (pg) { pg.classList.add('enter'); pg.querySelectorAll('.fkeys .fkey').forEach((k, i) => k.style.setProperty('--k', i)); } }
  if (dlgOpened) { const sc = root.querySelector(S.dlg === 'picker' ? '.scrim, .drawer-wrap' : '.scrim'); if (sc) sc.classList.add('enter'); }
  // the page list slides in when a device is opened, not when moving between its pages
  const dn = root.querySelector('.dnav'), navKey = dn ? 'dev|' + S.dev : null;
  if (dn && navKey !== lastNavKey) dn.classList.add('enter');
  lastNavKey = navKey;
  // opening a key's panel sends the page list out to the left; closing it brings the list back in
  const drawerNow = panelOn();
  if (dn && drawerNow && !lastDrawer) { dn.classList.add('leaving'); const w = root.querySelector('.devview2.panel-open .drawer-wrap'); if (w) w.classList.add('enter'); }
  if (dn && !drawerNow && lastDrawer) dn.classList.add('nav-back');
  lastDrawer = drawerNow;
  alignToNav();
  homeFit();
  if (from) glideFrom(from, root.querySelector('.dev-config .content > .page > :first-child'));
  bind();
  keyTips();
  ringDrag();
  gestureDrag();
  // the folder's name on its page: Enter or leaving the field saves it
  const fname = root.querySelector('.folder-name');
  if (fname) {
    const was = fname.defaultValue;   // the saved name, even when a redraw kept what is being typed
    fname.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') fname.blur(); if (e.key === 'Escape') { fname.value = was; fname.blur(); } };
    // the whole name is selected on the first click, ready to type over (not when a redraw gives
    // the focus back); the box grows with it
    fname.onfocus = () => { if (fname.dataset.keep) { delete fname.dataset.keep; return; } setTimeout(() => fname.select(), 0); };
    fname.addEventListener('input', () => { fname.size = Math.max(8, Math.min(24, fname.value.length + 1)); });
    fname.onchange = async () => { if (fname.value.trim() !== was) { await saveFolderName(fname.value); render(); } };
  }
  // with a key's panel open, a click anywhere else in the middle closes it (another key opens that one)
  const mid = root.querySelector('.devview2.drawer-open:not(.panel-open) .dev-config');
  // the ring opened from a button, and the Action ring page, keep their panel: the back arrow is the way out
  if (mid && !(S.page === 'gestures' && S.cfgFrom) && S.page !== 'ring') mid.addEventListener('click', e => { if (!e.target.closest('.hotspot, .ms-lab, .cfg-top, [data-act], input, select')) closeDrawer(); });
  // the backlight panel closes the same way: a click anywhere outside it (BACKLIGHT opens it again)
  const blMid = root.querySelector('.devview2.panel-open .dev-config');
  if (blMid) blMid.addEventListener('click', e => { if (!e.target.closest('.cfg-top, .bl-pin, .hotspot, .ms-lab')) closeDrawer(sidePanelClosed); });
  keepTyping(typing);
}
// The keyboard moves and resizes when the panel opens or closes: draw it where it was and let it
// glide to its new place, instead of snapping.
function glideFrom(from, el) {
  if (!el || !from.width || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = el.getBoundingClientRect();
  if (!to.width) return;
  el.style.transition = 'none';
  el.style.transformOrigin = '0 0';
  el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
  void el.offsetWidth;   // commit the starting place before asking for the move
  el.style.transition = 'transform .38s cubic-bezier(.2, 0, 0, 1)';
  el.style.transform = 'none';
  setTimeout(() => { el.style.transition = ''; el.style.transform = ''; el.style.transformOrigin = ''; }, 420);
}
// The key panel leaves to the right, easing in, and only then does the page list come back
function closeDrawer(after) {
  const w = root.querySelector('.drawer-wrap');
  if (!w) { dialogClosed(after); return; }
  if (w.classList.contains('closing')) return;
  stopRecorder();
  w.classList.add('closing');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => dialogClosed(after), reduce ? 0 : 170);
}
let lastPin = null;
function keyTips() {
  const tip = root.querySelector('.kb-tip'), wrap = tip && tip.parentElement;
  if (!tip || !wrap) return;
  wrap.querySelectorAll('.hotspot[data-name]').forEach(g => {
    g.onmouseenter = () => {
      tip.innerHTML = `<span class="k">${esc(g.dataset.name)}</span><span class="d ${g.dataset.custom ? 'custom' : ''}">${esc(g.dataset.does)}</span>`;
      const r = g.getBoundingClientRect(), pr = wrap.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.round(r.left + r.width / 2 - pr.left) + 'px';
      tip.style.top = Math.round(r.top - pr.top - 10) + 'px';
    };
    g.onmouseleave = () => { tip.hidden = true; };
  });
  // the key being edited keeps its label pinned above it, placed in the photo's own coordinates
  // so it rides along when the keyboard glides aside for the panel
  const sel = wrap.querySelector('.hotspot.selected[data-name]'), svg = sel && sel.ownerSVGElement, box = svg && svg.parentElement;
  if (sel && box) {
    const vb = svg.viewBox.baseVal, r = sel.querySelector('rect, circle'), b = r.getBBox();
    const pin = document.createElement('div');
    const pinKey = sel.dataset.cid; pin.className = 'kb-pin' + (pinKey === lastPin ? ' still' : ''); lastPin = pinKey;
    pin.innerHTML = `<span class="k">${esc(sel.dataset.name)}</span><span class="d ${sel.dataset.custom ? 'custom' : ''}">${esc(sel.dataset.does)}</span>`;
    pin.style.left = ((b.x + b.width / 2) / vb.width * 100) + '%';
    pin.style.top = (b.y / vb.height * 100) + '%';
    box.appendChild(pin);
    sel.onmouseenter = null;
  } else lastPin = null;
}
// In a device's view the page starts level with the first item of the list on the left (the
// keyboard lines up with KEYS); the list is centred in its column, so this is measured. The
// scrolling area is measured rather than the page, which may be mid-animation.
function alignToNav() {
  const first = root.querySelector('.dnav nav > .dnav-item'), box = root.querySelector('.dev-config .content'), page = box && box.querySelector(':scope > .page');
  if (!first || !page) return;
  // the device's Settings page runs from the top of the window, not from KEYS
  if (box.closest('.dev-config.full')) { page.style.paddingTop = '0px'; return; }
  // the action ring is centred in the space it has (lined up with the list it ran off the bottom)
  const ring = page.firstElementChild && page.firstElementChild.classList.contains('ring-page') ? page.firstElementChild : null;
  if (ring) { const cs = getComputedStyle(box), free = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - ring.getBoundingClientRect().height; page.style.paddingTop = Math.max(0, Math.floor(free / 2)) + 'px'; return; }
  const pad = parseFloat(getComputedStyle(box).paddingTop) || 0, origin = box.getBoundingClientRect().top + pad;
  let target = first.getBoundingClientRect().top;
  // the keyboard is centred on the list rather than lined up with its top
  const kb = page.firstElementChild && page.firstElementChild.classList.contains('kb-photo') ? page.firstElementChild : null;
  if (kb) {
    const items = root.querySelectorAll('.dnav nav > .dnav-item'), last = items[items.length - 1].getBoundingClientRect();
    target = (first.getBoundingClientRect().top + last.bottom) / 2 - kb.getBoundingClientRect().height / 2;
  }
  page.style.paddingTop = Math.max(0, Math.round(target - origin)) + 'px';
  // and across: the keyboard sits with as much space on its right as between it and the list
  if (kb && !root.querySelector('.devview2.drawer-open')) {
    kb.style.position = 'relative'; kb.style.left = '0px';
    const navRight = Math.max(...[...root.querySelectorAll('.dnav nav > .dnav-item')].map(b => b.getBoundingClientRect().right));
    const r = kb.getBoundingClientRect(), edge = box.getBoundingClientRect().right;
    const gap = (edge - navRight - r.width) / 2;
    kb.style.left = Math.round(navRight + gap - r.left) + 'px';
  }
}

// in a ring folder: its name top-left, typed over in place (Enter saves, Esc puts it back)
function folderNameField() {
  const f = ringFolder(ringTop(ringState()));
  if (!f) return '';
  const name = f.label || t('New folder');
  return `<input class="cfg-name folder-name ${S.ringAnim && S.ringAnim.kind === 'in' ? 'enter' : ''}" data-field="folderName" value="${esc(name)}" size="${Math.max(8, Math.min(24, name.length + 1))}" title="${t('Click to rename the folder')}" spellcheck="false"><button class="hbtn icon folder-rename" data-act="folder-rename" title="${t('Rename the folder')}"><i class="fa-solid fa-pen"></i></button><span class="folder-hint">${t('Enter to save · Esc to cancel')}</span>`;
}
function renderWindow() {
  const d = dev();
  const devPage = !S.appDetail && d && S.page !== 'home' && (devicePages(d).includes(S.page) || S.page === 'thumb');
  const mode = S.appDetail ? 'general' : S.page === 'home' ? 'home' : devPage ? 'device' : 'general';
  // the action ring's own page (no mouse here) is the same editor as a button's Configure action ring
  const ringSolo = mode === 'general' && !S.appDetail && S.page === 'ring';
  const title = S.appDetail ? (S.appDetail.name || t('Application')) : mode === 'device' ? d.name : (PAGES[S.page] ? PAGES[S.page][0] : 'NotLogi');
  const conflict = !S.conflictDismissed && S.conflicts.length && ['buttons', 'gestures', 'keys'].includes(S.page);
  const cname = conflict ? S.conflicts[0].name : '';
  const left = mode === 'home'
    ? `<span class="hello">${greeting()}</span>`
    : `<button class="hbtn icon" data-act="${S.appDetail ? 'back-apps' : 'go-home'}" title="${S.appDetail ? t('Back') : t('Home')}"><i class="fa-solid fa-arrow-left"></i></button>`;
  const imBanner = mode === 'home' ? permissionBanners() : '';
  // a newer release, found at startup: on Home, with Update (its release page) and a way to put it away
  const updateBanner = mode === 'home' && S.update ? `<div class="banner update"><i class="fa-solid fa-circle-arrow-up"></i><span>${t('Version {v} is available', { v: esc(S.update.latest) })}</span><button class="bact" data-act="update-open">${t('Update')}</button><button class="x" data-act="update-later" title="${t('Not now')}"><i class="fa-solid fa-xmark"></i></button></div>` : '';
  const agentDown = !S.connected ? `<div class="banner"><i class="fa-solid fa-plug-circle-xmark"></i><span>${S.agentBusy ? t('Starting the agent…') : t('<strong>The agent is not running.</strong> Settings cannot reach the devices.')}</span>${S.agentBusy ? '' : `<button class="bact" data-act="start-agent">${t('Start')}</button>`}</div>` : '';
  // a keyboard's own view keeps the corner to one action: add an application profile
  const controls = mode === 'device' ? `<div class="right">
          ${S.page === 'gestures' && S.cfgFrom && S.cfgKind === 'ring' ? ringProfileBar() : profileBar()}
          <button class="hbtn winmin" data-act="win-min" title="${t('Minimize window')}"><i class="fa-solid fa-minus"></i></button><button class="hbtn close" data-act="win-close" title="${t('Close to tray')}"><i class="fa-solid fa-xmark"></i></button>
        </div>` : `<div class="right">
          ${mode === 'home' ? `<button class="hbtn accent" data-act="pair" title="${t('Pair a new device with a receiver or Bluetooth')}"><i class="fa-solid fa-plus"></i>${t('Add device')}</button>` : ''}
          <button class="hbtn icon ${S.page === 'settings' ? 'on' : ''}" data-act="page" data-page="settings" title="${t('Settings')}"><i class="fa-solid fa-gear"></i></button>
          <div style="position:relative"><button class="hbtn icon" data-act="menu-theme" title="${t('Theme')}"><i class="fa-solid fa-circle-half-stroke"></i></button>${S.menu === 'theme' ? themeMenu() : ''}</div>
          <button class="hbtn winmin" data-act="win-min" title="${t('Minimize window')}"><i class="fa-solid fa-minus"></i></button><button class="hbtn close" data-act="win-close" title="${t('Close to tray')}"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
  let body;
  if (ringSolo) {
    const drawer = drawerUp();
    body = `<div class="devview2 ring-solo ${drawer ? 'drawer-open' : ''}"><aside class="dnav"><div class="cfg-back"><button class="hbtn icon" data-act="go-home" title="${t('Home')}"><i class="fa-solid fa-arrow-left"></i></button>${folderNameField() || `<span class="cfg-name">${t('Action ring')}</span>`}</div></aside><section class="dev-config solo"><div class="cfg-top"><div class="right">${ringProfileBar()}<button class="hbtn winmin" data-act="win-min" title="${t('Minimize window')}"><i class="fa-solid fa-minus"></i></button><button class="hbtn close" data-act="win-close" title="${t('Close to tray')}"><i class="fa-solid fa-xmark"></i></button></div></div><div class="content"><div class="page">${pageRing()}</div></div></section>${drawer ? renderPicker() : ''}</div>`;
  } else if (mode === 'device') {
    // the device's pages listed down the left (the first is open by default) with Settings at the
    // foot; the page itself on the right under the window buttons
    // Easy-Switch is not ready yet: listed, dimmed, marked Soon, and not clickable
    const items = navPages(d).map(p => p === 'easy' && !easyView(d) ? `<button class="dnav-item soon" disabled title="${t('Coming soon')}"><i class="fa-solid ${PAGES[p][1]}"></i>${PAGES[p][0]}<span class="soon-tag">${t('Soon')}</span></button>` : `<button class="dnav-item ${S.page === p || (p === 'buttons' && ['thumb', 'gestures'].includes(S.page)) ? 'on' : ''}" data-act="home-page" data-key="${esc(d.id)}" data-page="${p}"><i class="fa-solid ${PAGES[p][1]}"></i>${PAGES[p][0]}</button>`).join('');
    const flowSide = S.page === 'flow' && !!S.flowPanel && !!S.flow;   // Flow's settings, in the same side panel as the other pages
    const drawer = drawerUp(), blp = !drawer && (flowSide || S.addPanel || backlightPanel(d));
    body = `<div class="devview2 ${drawer || blp ? 'drawer-open' : ''} ${blp ? 'panel-open' : ''}"><aside class="dnav"><div class="cfg-back"><button class="hbtn icon" data-act="go-home" title="${t('Home')}"><i class="fa-solid fa-arrow-left"></i></button>${(S.page === 'gestures' && S.cfgKind === 'ring' && folderNameField()) || `<span class="cfg-name">${esc(d.name)}</span>`}</div><nav>${items}<button class="dnav-item ${S.page === 'info' ? 'on' : ''}" data-act="home-page" data-key="${esc(d.id)}" data-page="info"><i class="fa-solid fa-sliders"></i>${t('Settings')}</button></nav>${navBattery(d)}</aside><section class="dev-config solo ${S.page === 'info' ? 'full' : ''}"><div class="cfg-top">${controls}</div><div class="content"><div class="page">${renderPage(d)}</div></div></section>${drawer ? renderPicker() : blp ? (flowSide ? flowPanel(S.flow) : S.addPanel ? renderAddPanel(d) : S.page === 'hits' ? renderHitsPanel(d) : S.page === 'wheel' ? renderWheelPanel(d) : S.page === 'pointer' ? renderPointerPanel(d) : S.page === 'easy' ? renderEasyPanel(d) : renderBacklightPanel(d)) : ''}</div>`;
  } else {
    body = `<div class="content ${mode === 'home' ? 'landing' : ''}"><div class="page">${renderPage(d)}</div></div>${mode === 'home' ? `<div class="wish-line"><button class="btn primary" data-act="wish"><i class="fa-solid fa-wand-magic-sparkles"></i>${t('Make a wish')}</button><button class="btn" data-act="report"><i class="fa-solid fa-bug"></i>${t('Report an issue')}</button></div><footer class="agent-line ${S.connected ? '' : 'off'}"><i class="fa-solid fa-circle"></i>${S.connected ? t('Agent connected') : t('Agent not running')} · v${S.status.version || VERSION}</footer>` : ''}`;
  }
  return `<div class="window">
    <main class="main">
      ${mode === 'device' || ringSolo ? '' : `<header class="hb">
        <div class="left">${left}</div>
        <span class="title">${mode === 'home' ? '' : esc(title)}</span>
        ${controls}
      </header>`}
      ${agentDown}
      ${imBanner}
      ${updateBanner}
      ${conflict ? `<div class="banner"><i class="fa-solid fa-triangle-exclamation"></i><span>${t('<strong>{name} is running.</strong> Both programs divert the same buttons; only one will win.', { name: esc(toolName(cname)) })}</span><button class="bact" data-act="stop-tool" data-tool="${esc(cname)}">${t('Stop {name}', { name: esc(toolName(cname)) })}</button><button class="x" data-act="dismiss-conflict"><i class="fa-solid fa-xmark"></i></button></div>` : ''}
      ${body}
    </main></div>`;
}
// The device itself, on the left of its settings: photo (the mouse with its numbered buttons),
// battery, state, link and profile, and a way across to the other devices.
const THEMES = [['light', t('Light'), 'linear-gradient(135deg,#fff 50%,#3584e4 50%)'], ['dark', t('Dark'), 'linear-gradient(135deg,#222 50%,#3584e4 50%)'], ['ubuntu', 'Ubuntu', 'linear-gradient(135deg,#fafafa 50%,#e95420 50%)'], ['ubuntu-dark', t('Ubuntu dark'), 'linear-gradient(135deg,#2c2c2c 50%,#e95420 50%)']];
const themeMenu = () => `<div class="menu" data-menu><div class="mhead">${t('Appearance')}</div>${THEMES.map(([k, l, s]) => `<button data-act="theme" data-key="${k}"><span class="swatch" style="background:${s}"></span><span>${l}</span>${S.theme === k ? '<i class="fa-solid fa-check chk"></i>' : ''}</button>`).join('')}</div>`;

function renderPage(d) {
  if (S.appDetail) return pageAppDetail(S.appDetail);
  // previewing an app profile from another of the device's pages: show the controls it changes
  if (S.previewProfile && d && S.page !== 'buttons' && S.page !== 'keys' && !(S.page === 'gestures' && S.cfgFrom) && devicePages(d).includes(S.page)) return isMouse(d) ? pageButtons(d) : pageKeys(d);
  switch (S.page) {
    case 'buttons': return d ? pageButtons(d) : '';
    case 'assignments': return d ? pageButtons(d) : '';   // a gaming mouse: the same page, with its own names
    case 'dpi': return d ? pageDpi(d) : '';
    case 'wheel': return d ? pageWheel(d) : '';
    case 'hits': return d ? pageHits(d) : '';
    case 'gestures': return d ? pageGestures(d) : '';
    case 'pointer': return d ? pagePointer(d) : '';
    case 'haptics': return d ? pageHaptics(d) : '';
    case 'thumb': return d ? pageButtons(d) : '';   // merged into Buttons
    case 'easy': return d ? pageEasy(d) : '';
    case 'info': return d ? pageDeviceSettings(d) + (isMouse(d) && (d.state || {}).haptic ? pageHaptics(d) : '') + pageInfo(d) : '';   // the device's Settings (the app's own are under the sliders icon)
    case 'keys': return d ? pageKeys(d) : '';
    case 'backlight': return d ? pageBacklight(d) : '';
    case 'home': return pageHome();
    case 'apps': return pageApps();
    case 'ring': return pageRing();
    case 'notif': return pageNotif();
    case 'flow': return pageFlow();
    case 'backup': return pageBackup();
    case 'settings': return pageSettings();
    case 'about': return pageAbout();
  }
  return '';
}
function renderDialog() {
  if (S.dlg === 'picker') return S.picker && S.picker.drawer ? '' : renderPicker();
  if (S.dlg === 'pair') return renderPair();
  if (S.dlg === 'prompt') return renderPrompt();
  if (S.dlg === 'confirm') return renderConfirm();
  if (S.dlg === 'report') return renderReport();
  if (S.dlg === 'wish') return renderWish();
  if (S.dlg === 'uninstall') return renderUninstall();
  if (S.dlg === 'gaming') return renderGamingDialog(dev());
  return '';
}

// ============================================================ bind
// Flow: another computer's screen is dragged to the side of this one where it sits (a taken side swaps)
function bindFlowDrag() {
  const grid = root.querySelector('.fl-grid');
  if (!grid) return;
  grid.querySelectorAll('.fl-screen[data-peer]').forEach(el => {
    el.draggable = true;
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', el.dataset.peer); e.dataTransfer.effectAllowed = 'move'; requestAnimationFrame(() => grid.classList.add('dragging')); };
    el.ondragend = () => grid.classList.remove('dragging');
  });
  grid.querySelectorAll('[data-drop]').forEach(z => {
    z.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; z.classList.add('over'); };
    z.ondragleave = () => z.classList.remove('over');
    z.ondrop = e => {
      e.preventDefault(); z.classList.remove('over'); grid.classList.remove('dragging');
      const id = e.dataTransfer.getData('text/plain');
      if (id) onAction('flow-side', { dataset: { key: id, val: z.dataset.drop } });
    };
  });
}
function bind() {
  bindFlowDrag();
  root.querySelectorAll('[data-stop]').forEach(e => e.onclick = ev => ev.stopPropagation());
  root.querySelectorAll('.nav-item').forEach(b => b.onclick = () => go(b.dataset.page, b.dataset.dev || S.dev));
  // a button's name beside the mouse opens it just like its ring
  root.querySelectorAll('.ms-lab[data-ring]').forEach(l => l.onclick = () => { const h = root.querySelector(`.hotspot.ms[data-cid="${l.dataset.ring}"]`); if (h && h.onclick) h.onclick(); });
  // the add panel: filter as you type; icons fill in as they load
  const addq = root.querySelector('.add-panel .add-q');
  if (addq) addq.oninput = () => { const q = addq.value.trim().toLowerCase(); root.querySelectorAll('.add-list .add-app').forEach(r => { r.style.display = !q || r.dataset.name.includes(q) ? '' : 'none'; }); };
  root.querySelectorAll('.add-panel .app-ic[data-icon]').forEach(el => {
    const id = el.dataset.icon;
    if (id in icons.byId) return;
    icons.byId[id] = null;
    const a = (S.apps || []).find(x => x.id === id); if (!a) return;
    appIcon(a).then(u => { if (!u) return; icons.byId[id] = u; root.querySelectorAll(`.add-panel .app-ic[data-icon="${CSS.escape(id)}"]`).forEach(x => { x.innerHTML = `<img src="${u}" alt="">`; }); }).catch(() => {});
  });
  // hovering an app in the profile bar previews it; leaving the bar shows what was there again
  bindBarHover();
  root.querySelectorAll('.hotspot.pt').forEach(h => h.onclick = () => onAction('pt-pick', h));
  root.querySelectorAll('.hotspot.es').forEach(h => h.onclick = () => onAction('es-pick', h));
  root.querySelectorAll('.hotspot:not(.pt):not(.es)').forEach(h => h.onclick = () => openPicker({ drawer: h.classList.contains('key-photo') || h.classList.contains('ms'), dev: dev(), section: h.dataset.section, cid: h.dataset.cid === 'thumb' ? 'thumb' : Number(h.dataset.cid), label: h.dataset.name ? h.dataset.name : h.querySelector('title') ? h.querySelector('title').textContent.split(':')[0] : (h.dataset.section === 'thumbwheel' ? t('Thumb wheel') : (dev().controls.find(c => c.cid === Number(h.dataset.cid)) || {}).label) }));
  root.querySelectorAll('[data-act]').forEach(b => {
    const act = b.dataset.act;
    if (b.tagName === 'INPUT' && b.type === 'range') {
      b.oninput = () => { const out = root.querySelector(`[data-out="${b.dataset.out}"]:not(input)`); if (out) out.textContent = fmtOut(b.dataset.out, Number(b.value)); };
      b.onchange = () => onAction(act, b);
    } else if (b.tagName === 'SELECT') b.onchange = () => onAction(act, b);
    else if (b.tagName === 'INPUT') b.onchange = () => onAction(act, b);
    else b.onclick = e => { e.stopPropagation(); onAction(act, b, e); if (b.classList.contains('switch')) b.classList.toggle('on'); };   // a switch moves at once; the state it reports was read before this
  });
  root.querySelectorAll('[data-field]').forEach(i => {
    i.onclick = e => e.stopPropagation();
    // typed text goes to the view model; only what it says changed is drawn again
    i.oninput = () => {
      const redraw = setField(i.dataset.field, i.value);
      if (redraw === 'page') render();
      else if (redraw === 'apps') renderAppList();
      else if (redraw === 'list') { if (root.querySelector('.acts')) renderPickerList(); }
      else if (redraw === 'wish') { const btn = root.querySelector('[data-act=wish-open]'); if (btn) btn.disabled = !i.value.trim(); }
    };
    i.onkeydown = e => { if (e.key === 'Enter' && S.dlg === 'prompt') { e.preventDefault(); onAction('prompt-ok'); } if (e.key === 'Enter' && S.dlg === 'picker' && S.picker && S.picker.drawer && ['cmd', 'text', 'open'].includes(i.dataset.field)) { e.preventDefault(); assignTyped(); } };
  });
  // a gaming mouse's tools: the HITS test box takes the press and the release of the button tested,
  // the Sensitivity tool's arena each click with where it landed
  const ha = root.querySelector('[data-hits-area]');
  if (ha) { ha.onmousedown = e => { e.preventDefault(); hitsTestClick(dev(), 'down'); }; ha.onmouseup = () => hitsTestClick(dev(), 'up'); ha.oncontextmenu = e => e.preventDefault(); }
  // a macro being recorded: the keys pressed while its box has the focus
  const mr = root.querySelector('[data-macro-rec]');
  if (mr) {
    mr.onkeydown = e => { e.preventDefault(); e.stopPropagation(); macroKey(e.code, true, e.repeat); };
    mr.onkeyup = e => { e.preventDefault(); e.stopPropagation(); macroKey(e.code, false, false); };
    if (mr.classList.contains('on')) mr.focus();
  }
  // a keyboard photo being mapped: a click (not on a key already placed) puts the next key there
  const km = root.querySelector('[data-keymap-area] svg');
  if (km) km.onmousedown = e => { if (e.button !== 0 || e.target.closest('.km-spot')) return; const p = km.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const at = p.matrixTransform(km.getScreenCTM().inverse()); keymapClick(at.x, at.y); };
  const da = root.querySelector('[data-dpi-arena]');
  if (da) da.onmousedown = e => { const r = da.getBoundingClientRect(); dpiTestClick(dev(), e.clientX - r.left, e.clientY - r.top, r.width, r.height); };
  if (S.dlg === 'picker' && S.picker.cat === 'key' && S.picker.recording && !recorderActive()) armRecorder();
  const typed = root.querySelector('[data-field="typed"]');
  if (typed) {
    // The recorder swallows every key while it is armed (the agent grab takes them before the
    // page, the in-page fallback preventDefaults them), so typing needs it out of the way.
    typed.onfocus = () => {
      if (!S.picker || !S.picker.recording) return;
      stopRecorder(); setChord(S.picker.chord, false);
      const tx = root.querySelector('.recbox .t'); if (tx) tx.textContent = t('Click here, then press the keys');
      const box = root.querySelector('.recbox');
      if (box && !box.querySelector('[data-act="rec-start"]')) { const b = document.createElement('button'); b.className = 'btn primary'; b.dataset.act = 'rec-start'; b.textContent = t('Start recording'); b.onclick = e => { e.stopPropagation(); onAction('rec-start', b, e); }; box.appendChild(b); }
    };
    typed.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); onAction('pick-assign', typed); } };
  }
  // A re-render replaces the search box, and focusing it again would drop the caret to the
  // start, so anything typed next lands in front of what is already there.
  const q = root.querySelector('[data-field="q"]');
  if (q && S.dlg === 'picker' && (S.picker.cat !== 'key' || S.picker.drawer) && !S.picker.recording) setTimeout(() => {
    // not when another field has the caret (the folder's name being typed, a field just put back)
    const ae = document.activeElement;
    if (ae === q || (ae && ae !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
    q.focus();
    const n = q.value.length;
    try { q.setSelectionRange(n, n); } catch (e) {}
  }, 20);
}

// macOS: a banner for each permission that is missing. Accessibility is needed to press keys and
// buttons; Input Monitoring to reach devices over Bluetooth, so it is only asked for while no
// device is reachable (a receiver needs no permission). Each release is a new app to macOS when it
// is signed ad hoc, so a switch left on for the previous one no longer counts; toggling it does not
// rebind it to the new build either (macOS keeps the old signature requirement on the row), only
// removing and re-adding the app does.
function permissionBanners() {
  const ax = S.ax, imMissing = S.connected && S.status.input_monitoring && S.status.input_monitoring !== 'granted' && !S.devices.some(d => d.online !== false);
  let out = '';
  if (ax && ax.needed && !ax.trusted) out += `<div class="banner"><i class="fa-solid fa-universal-access"></i><span>${t('<strong>NotLogi needs Accessibility</strong> to press keys and buttons for you: switch it on under Privacy & Security > Accessibility. Already on? Remove NotLogi from that list with − and add it again with +: the switch still belongs to the version before the update.')}</span><button class="bact" data-act="ax-open">${t('Open settings')}</button></div>`;
  if (imMissing) out += `<div class="banner"><i class="fa-solid fa-keyboard"></i><span>${t('<strong>NotLogi needs Input Monitoring</strong> to reach devices over Bluetooth: switch it on under Privacy & Security > Input Monitoring. Already on? Remove NotLogi from that list with − and add it again with +.')}</span><button class="bact" data-act="im-open">${t('Open settings')}</button></div>`;
  return out;
}
export const provide = { permissionBanners, render, glideFrom, closeDrawer, keyTips, alignToNav, renderWindow, THEMES, themeMenu, renderPage, renderDialog, bind, schedule };
