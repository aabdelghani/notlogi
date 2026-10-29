// View model shared by every screen: the device and profile on screen, its pages, how actions are
// named and where the window goes next.
import * as Prof from '../../shared/profiles.mjs';
import { isMouse } from '../../shared/profiles.mjs';
import * as Act from '../../shared/actions.mjs';
import { t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let S, askKeepPreset, changed, fx, loadOnboard;
export function link(ctx) { ({ S, askKeepPreset, changed, fx, loadOnboard } = ctx); }

const dev = () => S.devices.find(d => d.id === S.dev) || null;
const profileOf = Prof.profileOf;
// The profile the device view shows: one being previewed (hover in the profile bar), else the one
// picked for editing, else the global one. An app profile only holds what it changes; anything
// it leaves alone comes from the global profile, the same way the agent applies it.
const shownProfile = () => S.previewProfile || S.editProfile || 'default';
const ownAssignment = Prof.ownAssignment;
const assignment = (d, section, cid, prof) => Prof.assignment(d, section, cid, prof || shownProfile());
// set in the shown profile (not the global one) on a control: marked on the photo
const overridden = (d, section, cid) => Prof.overridden(d, section, cid, shownProfile());
// names and icons of actions (shared/actions.mjs), with the agent's presets and this OS
const assignIcon = (a, native) => Act.assignIcon(a, native, S.presets);
const presetLabel = a => Act.presetLabel(a, S.presets, OS());
const actionIcon = a => Act.actionIcon(a, S.presets);
// which OS the app runs on: names of keys and settings follow it
const OS = () => (S.appInfo && S.appInfo.platform) || 'linux';
const IS_WIN = () => OS() === 'win32', IS_MAC = () => OS() === 'darwin', IS_LINUX = () => !IS_WIN() && !IS_MAC();
const META = () => IS_WIN() ? 'Win' : IS_MAC() ? 'Cmd' : 'Super';
const ALT = () => IS_MAC() ? 'Option' : 'Alt';
const keyName = k => Act.keyName(k, OS());
const agentNeedsBuild = () => !S.connected && !!S.agentInfo && !S.agentInfo.binary && !!S.agentInfo.canBuild;
// ------------------------------------------------------------- nav
const PAGES = {
  buttons: [t('Buttons'), 'fa-computer-mouse'], gestures: [t('Gestures & action ring'), 'fa-hand-pointer'], pointer: [t('Point & scroll'), 'fa-arrow-pointer'], thumb: [t('Thumb wheel'), 'fa-arrows-left-right'],
  haptics: [t('Haptic feedback'), 'fa-wave-square'], easy: [t('Easy-Switch'), 'fa-right-left'], info: [t('Battery & info'), 'fa-battery-three-quarters'], keys: [t('Keys'), 'fa-keyboard'], backlight: [t('Backlight'), 'fa-lightbulb'],
  dpi: [t('Sensitivity'), 'fa-gauge-high'], assignments: [t('Assignments'), 'fa-computer-mouse'], wheel: [t('Scroll wheel'), 'fa-arrows-up-down'], hits: [t('HITS'), 'fa-bolt'],
  home: [t('Home'), 'fa-house'], apps: [t('Profiles'), 'fa-layer-group'], ring: [t('Action ring'), 'fa-circle-notch'], notif: [t('Notifications'), 'fa-bell'], backup: [t('Backup & sync'), 'fa-cloud-arrow-down'], settings: [t('Settings'), 'fa-sliders'], about: [t('About'), 'fa-circle-info'], flow: [t('Flow'), 'fa-diagram-project'],
};
// G-series gaming mice (PRO X3 SUPERSTRIKE): G HUB's pages, not Options+'s
const GAMING = new Set(['40be']);
const isGaming = d => !!d && GAMING.has(d.id);
const devicePages = d => isGaming(d) ? ['dpi', 'assignments', 'wheel', 'hits', 'info'] : isMouse(d) ? ['buttons', 'gestures', 'pointer'].concat((d.state || {}).haptic ? ['haptics'] : [], ['easy', 'flow', 'info']) : ['keys', 'backlight', 'easy', 'info'];   // Flow is set up from the mouse
// what the device's left bar lists; the other device pages (Gestures, opened from a button set to
// gestures, and the MX Master 4's haptics, folded into Settings) are reached from these
const navPages = d => isGaming(d) ? ['dpi', 'assignments', 'wheel', 'hits'] : isMouse(d) ? ['buttons', 'pointer', 'easy', 'flow'] : ['keys', 'backlight', 'easy'];
const generalPagesAll = ['apps', 'ring', 'notif', 'backup', 'settings', 'about', 'flow'];   // Flow opens without a device too
function go(page, devId) {
  S.ringPath = []; if (devId !== undefined && devId !== S.dev) { S.editProfile = null; S.previewProfile = null; } if (page !== 'gestures') S.cfgFrom = null; S.infoFrom = null; S.waitDev = null; if (S.autoPreset && page !== 'dpi') setTimeout(askKeepPreset, 0); S.page = page; if (devId !== undefined) S.dev = devId; S.dlg = null; S.menu = null; S.appDetail = null; changed();
  // a gaming mouse's Settings show its onboard profiles, read from its memory as the page opens
  const d = dev(); if (page === 'info' && d && isGaming(d) && (d.state || {}).onboard) loadOnboard(d);
}


function countOverrides(d, key) {
  const p = profileOf(d, key), def = profileOf(d, 'default'); let n = 0;
  for (const sec of ['buttons', 'keys']) for (const [cid, a] of Object.entries(p[sec] || {})) if (JSON.stringify(a) !== JSON.stringify((def[sec] || {})[cid])) n++;
  if (p.thumbwheel !== undefined && JSON.stringify(p.thumbwheel) !== JSON.stringify(def.thumbwheel)) n++;
  return n;
}
const deviceProfiles = d => Object.entries(((d && d.config) || {}).profiles || {}).filter(([k]) => k !== 'default').map(([key, p]) => ({ key, name: p.name || key, match: p.match || [] }));
// a device the agent knows but cannot reach right now (receiver link down, or Bluetooth gone)
const isOffline = d => d.online === false || !!d.offline;
const drawerUp = () => !!(S.picker && S.picker.drawer && (S.dlg === 'picker' || (S.dlg === 'prompt' && S.prompt && S.prompt.back === 'picker')));
function prompt(title, fields, onOk, ok, note) { S.prompt = { title, fields, onOk, ok, note, back: drawerUp() ? 'picker' : null }; S.dlg = 'prompt'; changed(); fx.focus('.dlg input', { delay: 30 }); }
// What the focus tracker will report for an application picked by name: its window class from the
// installed list (or its id), else the name itself in lower case
function appClass(name) {
  const n = (name || '').trim().toLowerCase(), a = (S.apps || []).find(x => (x.name || '').toLowerCase() === n);
  return a ? (a.wm_class || a.id || n) : n.replace(/\s+/g, '-');
}

// What the MX Keys S reports, used only when a keyboard gives no positions for its F row
const FROW_FALLBACK = [199, 200, 226, 227, 259, 264, 284, 228, 229, 230, 231, 232];
// The F row and the keys beside it come from the keyboard itself: every reprogrammable control
// says which F key it sits on (1-12, 0 for a dedicated key). The MX Keys, MX Keys S and Craft all
// put different functions on those keys, so nothing here is fixed to one model.
function keyLayout(d) {
  const ctls = (d.controls || []).filter(c => c.divertable);
  const byPos = ctls.filter(c => c.position >= 1 && c.position <= 12).sort((a, b) => a.position - b.position);
  const frow = (byPos.length ? byPos : FROW_FALLBACK.map((cid, i) => { const c = ctls.find(x => x.cid === cid); return c && Object.assign({}, c, { position: i + 1 }); }).filter(Boolean))
    .map(c => ({ cid: c.cid, pos: c.position, k: 'F' + c.position, icon: KEY_ICONS[c.name] || 'fa-keyboard', label: c.label }));
  const inRow = new Set(frow.map(k => k.cid));
  const special = ctls.filter(c => !inRow.has(c.cid)).map(c => ({ cid: c.cid, icon: KEY_ICONS[c.name] || 'fa-keyboard', label: c.label }));
  return { frow, special };
}
const KEY_ICONS = { brightness_down: 'fa-sun', brightness_up: 'fa-sun', backlight_down: 'fa-lightbulb', backlight_up: 'fa-lightbulb', dictation: 'fa-microphone', emoji: 'fa-face-smile', emoji_heart_eyes: 'fa-face-smile', emoji_crying: 'fa-face-smile', emoji_smiley: 'fa-face-smile', emoji_tears: 'fa-face-smile', mic_mute: 'fa-microphone-slash', prev_track: 'fa-backward-step', play_pause: 'fa-play', next_track: 'fa-forward-step', mute: 'fa-volume-xmark', volume_down: 'fa-volume-low', volume_up: 'fa-volume-high', calculator: 'fa-calculator', screenshot: 'fa-camera', context_menu: 'fa-bars', screen_lock: 'fa-lock', mission_control: 'fa-table-cells-large', launchpad: 'fa-grip', show_desktop: 'fa-desktop', home_show_desktop: 'fa-desktop', screen_capture: 'fa-camera', eject: 'fa-eject', do_not_disturb: 'fa-moon', app_switch: 'fa-window-restore', app_switch_dashboard: 'fa-window-restore', search: 'fa-magnifying-glass', home: 'fa-house', virtual_keyboard: 'fa-keyboard', language_switch: 'fa-language', voice_assistant: 'fa-comment-dots', open_apps: 'fa-window-restore', all_apps: 'fa-grip', switch_app: 'fa-window-restore' };
// the gestures and action ring page exists only as a mouse button's Configure view; reached any
// other way (another device, a lost way back) it gives way to the device's own first page
function pageGuard() {
  if (S.page !== 'gestures') return;
  const gd = dev();
  if (!gd || !isMouse(gd) || !S.cfgFrom) { S.cfgFrom = null; S.page = gd ? devicePages(gd)[0] : 'home'; }
}
// the dialog or panel has gone (its closing animation done): then `after`, and the window redrawn
function dialogClosed(after) { S.dlg = null; if (after) after(); changed(); }
// the side panel beside a device closed: adding apps is cancelled, the backlight panel stays shut
// until BACKLIGHT opens it again
function sidePanelClosed() { if (S.page === 'flow' && S.flowPanel) S.flowPanel = false; else if (S.page === 'hits' && S.hitsPanel) { S.hitsPanel = false; S.menu = null; } else if (S.page === 'wheel' && S.wheelPanel) S.wheelPanel = false; else if (S.page === 'dpi' && S.dpiPanel) { S.dpiPanel = false; S.menu = null; if (S.autoPreset) setTimeout(askKeepPreset, 0); } else if (S.addPanel) { S.addPanel = false; S.addSel = []; } else S.blClosed = true; }
// a one-time hint for the next drawing (which way to slide, what to animate): read once, then gone
function takeCue(name, none = null) { const v = S[name]; S[name] = none; return v; }
// A field typed into: its value kept where the open dialog keeps it. Answers what of the page
// needs drawing again: 'page', the picker's 'apps' or 'list', the 'wish' button, or nothing.
function setField(f, v) {
  if (S.dlg === 'picker' && S.picker && S.picker.drawer) { S.picker[f] = v; if (f === 'cmd' || f === 'text' || f === 'open') S.picker.cat = 'cmd'; else if (f === 'typed') S.picker.cat = 'key'; return f === 'q' ? 'page' : null; }
  if (S.dlg === 'report') { S.report = Object.assign({}, S.report, { [f]: v }); return null; }
  if (S.dlg === 'wish') { S.wish = { what: v }; return 'wish'; }
  if (S.dlg === 'picker') { S.picker[f] = v; return f === 'q' ? (S.picker.cat === 'app' ? 'apps' : 'list') : null; }
  if (S.dlg === 'prompt') { const x = S.prompt.fields.find(x => x.key === f); if (x) x.value = v; }
  return null;
}
export const provide = { isGaming, dev, profileOf, shownProfile, ownAssignment, assignment, overridden, assignIcon, presetLabel, actionIcon, OS, IS_WIN, IS_MAC, IS_LINUX, META, ALT, keyName, agentNeedsBuild, PAGES, devicePages, navPages, generalPagesAll, go, countOverrides, deviceProfiles, isOffline, drawerUp, prompt, appClass, FROW_FALLBACK, keyLayout, KEY_ICONS, pageGuard, dialogClosed, sidePanelClosed, takeCue, setField };
