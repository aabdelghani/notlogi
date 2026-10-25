// View model: the action picker: what each control can do, what is recommended for it, and
// assigning the picked action.
import { isFolderSlot, RING_DIRS, RING_NEXT_PROFILE, RING_BRIGHTNESS } from '../../shared/ring.mjs';
import * as Act from '../../shared/actions.mjs';
import { PRESET_ICON, ICON } from '../../shared/actions.mjs';
import { en, inEnglish, t } from '../../shared/i18n.mjs';

// from the rest of the window, filled in by link()
let ALT, META, S, SLOTS, actionIcon, api, assignment, call, changed, dev, deviceProfiles, fx, gestureCapable, gestureControl, gestureObject, go, keyName, merge, presetLabel, prompt, ringSelectAdd, ringSlots, ringTidyFolders, saveRingSlots, setAssign, toast, ringEditorOn, isGaming, openMacro;
export function link(ctx) { ({ ALT, META, S, SLOTS, actionIcon, api, assignment, call, changed, dev, deviceProfiles, fx, gestureCapable, gestureControl, gestureObject, go, keyName, merge, presetLabel, prompt, ringSelectAdd, ringSlots, ringTidyFolders, saveRingSlots, setAssign, toast, ringEditorOn, isGaming, openMacro } = ctx); }

// the screen state this view model owns: the action picker open (null: none)
export const state = {
  picker: null, dir: 'tap',
};

// ----------------------------------------------------------- dialogs
const PICKER_CATS = [['all', t('All'), 'fa-list'], ['key', t('Keystroke'), 'fa-keyboard'], ['media', t('Media'), 'fa-play'], ['window', t('Window'), 'fa-window-maximize'], ['ws', t('Workspaces'), 'fa-table-cells-large'], ['cmd', t('Command'), 'fa-terminal'], ['app', t('Apps'), 'fa-rocket'], ['device', t('Device'), 'fa-computer-mouse']];
const CAT_OF = { media: ['volume_up', 'volume_down', 'mute', 'mic_mute', 'play_pause', 'next_track', 'prev_track', 'brightness_up', 'brightness_down'],
  window: ['close_window', 'maximize', 'minimize', 'tile_left', 'tile_right', 'show_desktop', 'app_switcher', 'screenshot', 'screenshot_area', 'lock', 'terminal', 'calculator', 'emoji_picker', 'action_ring', 'emoji', 'context_menu', 'copy', 'paste', 'undo', 'redo', 'zoom_in', 'zoom_out', 'tab_next', 'tab_prev'],
  ws: ['overview', 'workspace_next', 'workspace_prev'],
  device: ['native', 'nothing', 'primary_click', 'secondary_click', 'middle_click', 'double_click', 'back', 'forward', 'scroll_up', 'scroll_down', 'scroll_left', 'scroll_right', 'dpi_up', 'dpi_down', 'dpi_slot_cycle', 'dpi_shift', 'dpi_default', 'dpi_goto_shift', 'gshift', 'battery_level', 'onboard_profile_cycle', 'easy_switch_1', 'easy_switch_2', 'easy_switch_3', 'dpi_cycle', 'smartshift_toggle', 'open_home', 'gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan', 'hscroll', 'vscroll', 'zoom_wheel', 'volume_wheel', 'tabs_wheel', 'workspaces_wheel', 'brightness_wheel'] };
const CAT_LABEL = { media: t('Media'), window: t('Window'), ws: t('Shell'), device: t('Device') };
function pickerItems(p) {
  const all = S.presets.all;
  const allowed = new Set(p.section === 'ring' ? S.presets.buttons.filter(k => !['native', 'nothing', 'action_ring'].includes(k) && all[k] && all[k].type !== 'gesture') : p.section === 'thumbwheel' ? S.presets.wheel : p.section === 'gesture' ? Object.keys(all).filter(k => ['nothing', 'keystroke', 'button', 'command', 'change_host', 'dpi_cycle', 'scroll', 'smartshift_toggle', 'open'].includes(all[k].type)) : p.section === 'keys' ? S.presets.keys.filter(k => k !== 'action_ring') : S.presets.buttons);
  withoutGaming(p, allowed);
  const items = [];
  for (const [cat, keys] of Object.entries(CAT_OF)) for (const k of keys) if (allowed.has(k) && all[k] && (p.cat === 'all' || p.cat === cat)) {
    if (all[k].type === 'gesture' && p.section !== 'buttons') continue;
    if (p.section === 'buttons' && all[k].type === 'gesture' && !(p.ctl && p.ctl.raw_xy)) continue;
    items.push({ key: k, cat, icon: PRESET_ICON[k] || ICON[all[k].type], label: t(all[k].label), meta: CAT_LABEL[cat] }); // i18n: data
  }
  const q = (p.q || '').toLowerCase();
  return q ? items.filter(i => i.label.toLowerCase().includes(q)) : items;
}
// The key panel, laid out like Options+: RECOMMENDED open on top (from its per-key table,
// recommendations_slot_win.json: the key's own function, then a keystroke, then the action ring),
// then its categories folded, then what only LogiMX has. While searching, every match is listed.
// Options+ card -> LogiMX preset, for the cards it recommends past a key's own function
const OPTS_CARD = { win_print_screen: 'screenshot', win_emoji: 'emoji' };
// key control id -> what Options+ names the key's own function, plus any extra card it offers
const RECOMMEND = { 10: [t('Calculator')], 110: [t('Show desktop')], 111: [t('Lock screen')], 191: [t('Screen capture'), 'win_print_screen'], 199: [t('Brightness down')], 200: [t('Brightness up')], 212: [t('Search')], 224: [t('Task view')], 225: [t('Notifications')], 226: [t('Backlight down')], 227: [t('Backlight up')], 228: [t('Previous track')], 229: [t('Play / Pause')], 230: [t('Next track')], 231: [t('Mute')], 232: [t('Volume down')], 233: [t('Volume up')], 234: [t('Context menu')], 259: [t('Dictation')], 264: [t('Emoji menu'), 'win_emoji'], 266: [t('Screen snip')], 284: [t('Mute microphone')] };
// a mouse's buttons and thumb wheel: what Options+ recommends for each (recommendations_slot_win.json,
// MX Master 3S), as LogiMX presets; its own function comes first as Default
const MOUSE_RECOMMEND = { 82: ['smartshift_toggle', 'overview', 'show_desktop', 'gesture_navigation', 'action_ring'], 83: ['copy', 'volume_down', 'undo', 'action_ring'], 86: ['paste', 'volume_up', 'redo', 'action_ring'],
  195: ['gesture_navigation', 'overview', 'show_desktop', 'screenshot_area', 'screenshot', 'app_switcher', 'action_ring'], 196: ['overview', 'middle_click', 'gesture_navigation', 'screenshot_area', 'screenshot', 'action_ring'], 416: ['action_ring', 'smartshift_toggle', 'overview', 'screenshot'],
  thumb: ['zoom_wheel', 'volume_wheel', 'tabs_wheel'] };
// Options+ tailors the recommended list to the application being edited (Chrome, Word, Zoom, ...);
// these are the Linux equivalents. 'app:' items are ready-made keystrokes, the rest are presets.
const AK = (keys, label, icon) => ({ type: 'keystroke', keys, label, icon });
const AW = (plus, minus, label) => ({ type: 'adapter', step: 120, label, plus: { type: 'keystroke', keys: plus }, minus: { type: 'keystroke', keys: minus } });
const APP_ACTIONS = {
  new_tab: AK(['KEY_LEFTCTRL', 'KEY_T'], en('New tab')), close_tab: AK(['KEY_LEFTCTRL', 'KEY_W'], en('Close tab')), reopen_tab: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_T'], en('Reopen closed tab')),
  refresh: AK(['KEY_F5'], en('Refresh page')), save: AK(['KEY_LEFTCTRL', 'KEY_S'], en('Save')), find: AK(['KEY_LEFTCTRL', 'KEY_F'], en('Find')),
  paste_special: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_V'], en('Paste special')), page_up: AK(['KEY_PAGEUP'], en('Page up')), page_down: AK(['KEY_PAGEDOWN'], en('Page down')),
  slide_prev: AK(['KEY_PAGEUP'], en('Previous slide')), slide_next: AK(['KEY_PAGEDOWN'], en('Next slide')), start_show: AK(['KEY_F5'], en('Start slide show')),
  zoom_mic: AK(['KEY_LEFTALT', 'KEY_A'], en('Mute / unmute microphone')), zoom_cam: AK(['KEY_LEFTALT', 'KEY_V'], en('Camera on / off')),
  teams_mic: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_M'], en('Mute / unmute microphone')), teams_cam: AK(['KEY_LEFTCTRL', 'KEY_LEFTSHIFT', 'KEY_O'], en('Camera on / off')),
  back_forward_wheel: AW(['KEY_LEFTALT', 'KEY_RIGHT'], ['KEY_LEFTALT', 'KEY_LEFT'], en('Back / forward')), page_wheel: AW(['KEY_PAGEDOWN'], ['KEY_PAGEUP'], en('Page down / up')),
  slide_wheel: AW(['KEY_PAGEDOWN'], ['KEY_PAGEUP'], en('Next / previous slide')), undo_redo_wheel: AW(['KEY_LEFTCTRL', 'KEY_Y'], ['KEY_LEFTCTRL', 'KEY_Z'], en('Redo / undo')),
  text_size_wheel: AW(['KEY_LEFTCTRL', 'KEY_RIGHTBRACE'], ['KEY_LEFTCTRL', 'KEY_LEFTBRACE'], en('Text size')),
};
for (const [k, a] of Object.entries(APP_ACTIONS)) a.preset = 'app:' + k;   // so the list can tell which one is in use
const BROWSER = { name: 'browser', match: /chrom|firefox|edge|brave|vivaldi|opera|librewolf|zen/i,
  thumb: ['tabs_wheel', 'zoom_wheel', 'app:back_forward_wheel', 'volume_wheel'], 82: ['app:refresh', 'app:new_tab', 'smartshift_toggle', 'action_ring'],
  83: ['back', 'undo', 'copy', 'app:close_tab', 'app:new_tab'], 86: ['forward', 'redo', 'paste', 'app:reopen_tab', 'app:refresh', 'app:new_tab'],
  195: ['gesture_navigation', 'app:refresh', 'app:close_tab', 'app:reopen_tab', 'app:new_tab', 'action_ring'], 196: ['middle_click', 'gesture_navigation', 'app:refresh', 'app:new_tab'] };
const OFFICE = { thumb: ['zoom_wheel', 'app:text_size_wheel', 'app:page_wheel', 'app:undo_redo_wheel'], 82: ['smartshift_toggle', 'app:paste_special', 'app:save', 'action_ring'],
  83: ['undo', 'copy', 'paste', 'app:page_up', 'app:page_down'], 86: ['redo', 'paste', 'copy', 'app:page_down', 'app:page_up'],
  195: ['gesture_navigation', 'app:save', 'app:find', 'app:paste_special', 'action_ring'], 196: ['middle_click', 'gesture_navigation', 'app:paste_special', 'app:save'] };
const CALL = (mic, cam) => ({ thumb: ['volume_wheel', 'brightness_wheel'], 82: [mic, cam, 'action_ring'], 83: [mic, cam], 86: [cam, mic], 195: ['gesture_navigation', mic, cam, 'action_ring'], 196: [mic, cam] });
const APP_SETS = [BROWSER,
  Object.assign({ name: 'Writer', match: /libreoffice-writer|soffice.*writer/i }, OFFICE),
  Object.assign({ name: 'Calc', match: /libreoffice-calc/i }, OFFICE),
  { name: 'Impress', match: /libreoffice-impress/i, thumb: ['app:slide_wheel', 'zoom_wheel'], 82: ['app:start_show', 'action_ring'], 83: ['app:slide_prev', 'undo'], 86: ['app:slide_next', 'redo'], 195: ['gesture_navigation', 'app:start_show', 'action_ring'], 196: ['app:start_show', 'middle_click'] },
  Object.assign({ name: 'Zoom', match: /zoom/i }, CALL('app:zoom_mic', 'app:zoom_cam')),
  Object.assign({ name: 'Teams', match: /teams/i }, CALL('app:teams_mic', 'app:teams_cam'))];
// the set for the application profile being edited, if it has one
function appSet(p) {
  const key = p && p.profile; if (!key || key === 'default') return null;
  const prof = deviceProfiles(dev()).find(x => x.key === key);
  const hay = [key].concat(prof ? prof.match : []).join(' ');
  return APP_SETS.find(a => a.match.test(hay)) || null;
}
const appLabel = set => set.name === 'browser' ? t('For browsers') : t('For {app}', { app: set.name });
// an item of the list: a preset, or one of the ready-made keystrokes above (their labels are kept
// in English, as stored in the config, and shown translated)
const recItem = k => k.startsWith('app:') ? { key: k, icon: (APP_ACTIONS[k.slice(4)].type === 'adapter' ? 'fa-arrows-up-down' : 'fa-keyboard'), label: t(APP_ACTIONS[k.slice(4)].label) } : presetItem(k); // i18n: data
const MOUSE_GROUP = ['middle_click', 'double_click', 'back', 'forward', 'dpi_cycle', 'smartshift_toggle', 'gesture_navigation', 'gesture_windows', 'gesture_volume', 'gesture_pan', 'action_ring'];
const WHEEL_GROUP = ['hscroll', 'vscroll', 'zoom_wheel', 'volume_wheel', 'tabs_wheel', 'workspaces_wheel', 'brightness_wheel', 'nothing'];
const K = (code, label) => ({ code: 'KEY_' + code, label: label || code });
const keyRange = (a, f) => a.split(' ').map(c => K(c, f ? f(c) : c));
// built when first needed, once the OS (and so the modifier names) is known
const keyGroups = () => ({
  fkeys: keyRange('F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'),
  letters: keyRange('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'),
  numbers: keyRange('1 2 3 4 5 6 7 8 9 0'),
  symbols: [K('GRAVE', '`'), K('MINUS', '-'), K('EQUAL', '='), K('LEFTBRACE', '['), K('RIGHTBRACE', ']'), K('BACKSLASH', '\\'), K('SEMICOLON', ';'), K('APOSTROPHE', "'"), K('COMMA', ','), K('DOT', '.'), K('SLASH', '/'), K('102ND', '< >')],
  numpad: keyRange('KP0 KP1 KP2 KP3 KP4 KP5 KP6 KP7 KP8 KP9', c => 'Num ' + c.slice(2)).concat([K('KPENTER', 'Num Enter'), K('KPEQUAL', 'Num ='), K('NUMLOCK', 'Num Lock'), K('KPMINUS', 'Num -'), K('KPDOT', 'Num .'), K('KPPLUS', 'Num +'), K('KPSLASH', 'Num /'), K('KPASTERISK', 'Num *')]),
  modifiers: [K('LEFTCTRL', t('Left {key}', { key: 'Ctrl' })), K('RIGHTCTRL', t('Right {key}', { key: 'Ctrl' })), K('LEFTSHIFT', t('Left {key}', { key: 'Shift' })), K('RIGHTSHIFT', t('Right {key}', { key: 'Shift' })), K('LEFTALT', t('Left {key}', { key: ALT() })), K('RIGHTALT', t('Right {key}', { key: ALT() })), K('LEFTMETA', t('Left {key}', { key: META() })), K('RIGHTMETA', t('Right {key}', { key: META() }))],
  arrows: [K('UP', t('Up arrow')), K('DOWN', t('Down arrow')), K('LEFT', t('Left arrow')), K('RIGHT', t('Right arrow')), K('HOME', 'Home'), K('END', 'End'), K('PAGEUP', 'Page up'), K('PAGEDOWN', 'Page down'), K('INSERT', 'Insert')],
  others: [K('CAPSLOCK', 'Caps Lock'), K('SCROLLLOCK', 'Scroll Lock'), K('BACKSPACE', 'Backspace'), K('DELETE', 'Delete'), K('ESC', 'Escape'), K('TAB', 'Tab'), K('SPACE', 'Space'), K('ENTER', 'Enter')],
});

// Options+'s action categories with the LogiMX presets that belong to each
const OPTS_CATS = {
  nav: ['overview', 'show_desktop', 'app_switcher', 'workspace_prev', 'workspace_next', 'close_window', 'maximize', 'minimize', 'tile_left', 'tile_right', 'tab_next', 'tab_prev', 'zoom_in', 'zoom_out', 'screenshot', 'screenshot_area', 'lock', 'calculator', 'emoji_picker', 'emoji', 'dictation', 'context_menu', 'brightness_up', 'brightness_down', 'terminal'],
  edit: ['copy', 'paste', 'undo', 'redo', 'open_home'],
  media: ['volume_dial', 'play_pause', 'prev_track', 'next_track', 'volume_up', 'volume_down', 'mute', 'mic_mute'],
  other: ['easy_switch_1', 'easy_switch_2', 'easy_switch_3', 'nothing'],
  mouse: MOUSE_GROUP, wheel: WHEEL_GROUP,
  // a gaming mouse, as G HUB's System tab lists them
  gmouse: ['primary_click', 'secondary_click', 'middle_click', 'forward', 'back', 'dpi_shift', 'double_click', 'scroll_up', 'scroll_down', 'scroll_left', 'scroll_right', 'dpi_up', 'dpi_down', 'dpi_goto_shift', 'dpi_default', 'dpi_slot_cycle'],
  gdevice: ['battery_level', 'gshift', 'onboard_profile_cycle'],
};
// what only a gaming mouse does (its DPI slots, G-Shift, its onboard memory)
const GAMING_ONLY = new Set(['dpi', 'gshift', 'onboard_cycle']);
// and what a gaming mouse has no use for: an MX mouse's fixed DPI levels and its wheel's SmartShift
const MX_ONLY = new Set(['dpi_cycle', 'smartshift_toggle']);
const withoutGaming = (p, set) => { const g = gamingPick(p); for (const k of [...set]) { const ty = (S.presets.all[k] || {}).type; if (g ? MX_ONLY.has(ty) : GAMING_ONLY.has(ty)) set.delete(k); } return set; };
// three sections, as Options+ shows a key: what it recommends, Smart actions (things that run,
// type or open), and every other action grouped under small headings
const DRAWER_SECTIONS = [['rec', t('Recommended')], ['smart', t('Smart actions')], ['more', t('Other actions')]];
const ACTION_GROUPS = [['nav', t('Navigate computer')], ['edit', t('Edit files and folders')], ['media', t('Media and audio')], ['other', t('Device')]];
// what each kind of control lists: a key, a mouse button (with a mouse group first), or the thumb wheel
const gamingPick = p => { const d = S.devices.find(x => x.id === p.dev); return !!d && isGaming(d); };
const groupsFor = p => p.section === 'thumbwheel' ? [['wheel', t('Wheel')]] : p.section === 'buttons' ? [gamingPick(p) ? ['gmouse', t('Mouse')] : ['mouse', t('Mouse')], ['macros', t('Macros')]].concat(gamingPick(p) ? [['gdevice', t('Device')]] : [], ACTION_GROUPS) : ACTION_GROUPS;
const sectionsFor = p => p.section === 'thumbwheel' ? DRAWER_SECTIONS.filter(([k]) => k !== 'smart') : DRAWER_SECTIONS;
const KEY_GROUP_NAMES = [['fkeys', t('F keys')], ['letters', t('Letters')], ['numbers', t('Numbers')], ['symbols', t('Symbols')], ['numpad', t('Num pad')], ['modifiers', t('Modifier keys')], ['arrows', t('Arrow and navigation')], ['others', t('Others')]];
const curOf = p => typeof p.current === 'string' ? p.current : (p.current && (p.current.preset || (p.current.type === 'brightness_dial' ? 'ring:brightness' : undefined)));
// a single key: its keystroke, so the panel can say which one is in use
const keyCur = p => p.current && typeof p.current === 'object' && p.current.type === 'keystroke' && (p.current.keys || []).length === 1 ? p.current.keys[0] : null;
// the presets a control can take: keys never get the ring, gestures only on a button that can be held and moved
const RING_RECOMMEND = ['volume_dial', 'overview', 'show_desktop', 'screenshot_area', 'lock', 'calculator', 'emoji_picker', 'terminal', 'play_pause', 'easy_switch_1', 'easy_switch_2', 'easy_switch_3'];
// a ring action that changes a level in place: hold and drag it, or scroll over it, with the
// ring open. Marked in the lists with a small sliders badge.
const RING_DRAG = new Set(['volume_dial', 'ring:brightness']);
// turned with the wheel while the ring is open
const RING_WHEEL = new Set(['volume_dial', 'volume_up', 'volume_down', 'brightness_up', 'brightness_down', 'zoom_in', 'zoom_out', 'next_track', 'prev_track']);
// Easy-Switch named after the computer on that channel, when the mouse knows it
function easyLabel(k) {
  const m = /^easy_switch_(\d)$/.exec(k || ''); if (!m) return null;
  const d = S.devices.find(x => x.id === S.dev && (x.state || {}).hosts) || S.devices.find(x => (x.state || {}).hosts);
  const n = d && ((d.state.hosts.names || [])[Number(m[1]) - 1] || {}).name;
  return n ? t('Switch to {name}', { name: n }) : null;
}
const GESTURE_RECOMMEND = ['overview', 'show_desktop', 'app_switcher', 'workspace_next', 'workspace_prev', 'volume_up', 'volume_down', 'play_pause'];
const GESTURE_TYPES = ['nothing', 'keystroke', 'button', 'command', 'change_host', 'dpi_cycle', 'scroll', 'smartshift_toggle', 'open'];
const allowedFor = p => withoutGaming(p, new Set(p.section === 'ring' ? S.presets.buttons.filter(k => !['native', 'nothing', 'action_ring'].includes(k) && (S.presets.all[k] || {}).type !== 'gesture')
  : p.section === 'gesture' ? Object.keys(S.presets.all).filter(k => GESTURE_TYPES.includes(S.presets.all[k].type))
  : p.section === 'thumbwheel' ? S.presets.wheel.filter(k => k !== 'volume_dial') : p.section === 'buttons' ? S.presets.buttons.filter(k => k !== 'volume_dial' && ((S.presets.all[k] || {}).type !== 'gesture' || (p.ctl && p.ctl.raw_xy))) : S.presets.keys.filter(k => k !== 'volume_dial')));
function drawerItems(sec, p) {
  // a button's macros: the device's own, and a new one
  if (sec === 'macros') {
    const d = S.devices.find(x => x.id === (p || S.picker).dev), list = d && Array.isArray(((d.config || {}).settings || {}).macros) ? d.config.settings.macros : [];
    return list.map(m => ({ key: 'macro:' + m.id, icon: 'fa-list-ol', label: m.name, meta: { once: t('Once'), while_held: t('While held'), toggle: t('Toggle') }[m.repeat] || '' })).concat([{ key: 'macro:new', icon: 'fa-plus', label: t('New macro…') }]);
  }
  const ok = allowedFor(p || S.picker);
  return (OPTS_CATS[sec] || []).filter(k => ok.has(k) && S.presets.all[k]).map(presetItem);
}
function openPicker(o) {
  // what is open right now, so the launch list can lead with it instead of 122 alphabetical entries
  api.quiet('running_apps').then(r => { S.running = r; if (S.picker && S.picker.cat === 'app') fx.refreshAppList(); }).catch(() => { S.running = []; });
  const d = o.dev || dev();
  // a gaming mouse's G-Shift layer is picked for like its buttons, and kept apart
  const layer = o.section === 'buttons_gshift' ? 'gshift' : null;
  const section = layer ? 'buttons' : o.section, cid = o.cid;
  const gslot = section === 'gesture' && d && o.slot ? gestureObject(d, cid)[o.slot] : null;
  const current = section === 'gesture' ? (gslot ? gslot.preset || gslot : null) : section === 'ring' ? (ringSlots()[cid] || {}).action || null : assignment(d, layer ? 'buttons_gshift' : section, cid, o.profile);
  const ctl = typeof cid === 'number' && section !== 'ring' && d ? d.controls.find(c => c.cid === cid) : null;
  S.picker = { drawer: !!o.drawer, fold: o.drawer ? { rec: true } : null, dev: d ? d.id : null, section, layer, cid, label: o.label, profile: o.profile || S.editProfile || 'default', cat: o.cat || 'all', current, ctl, sel: null, slot: o.slot, recording: o.drawer ? false : o.cat === 'key' };
  S.dlg = 'picker'; changed();
}
// the ring's actions open on the right with the ring, on its first empty slot (else the top one)
function openRingPanel(d) {
  const first = Math.max(0, ringSlots().findIndex(s => !s));
  openPicker({ drawer: true, dev: d || dev(), section: 'ring', cid: first, label: RING_DIRS[first] });
}
async function assignPicked(action) {
  const p = S.picker; const d = S.devices.find(x => x.id === p.dev);
  if (p.section === 'ring') {
    const entry = { action, label: inEnglish(() => easyLabel(action) || presetLabel(action)), icon: actionIcon(action) };   // saved in English, shown translated
    if (p.insert) {
      const list = ringSlots().filter(Boolean);
      if (list.length >= 8) { toast(t('A folder holds 8 actions'), true); return; }
      if (p.insert === 'start') list.unshift(entry); else list.push(entry);
      await saveRingSlots(list);
      p.cid = p.insert === 'start' ? 0 : list.length - 1; p.insert = null; p.label = t('Action {n}', { n: p.cid + 1 });
    } else {
      const slots = ringSlots();
      slots[p.cid] = entry;
      await saveRingSlots(slots);
    }
    if (p.drawer) { p.current = action; p.sel = null; p.selKey = null; p.cat = 'all'; p.chord = []; p.typed = ''; changed(); toast(t('Slot {n}: {action}', { n: p.cid + 1, action: presetLabel(action) })); return; }
    S.dlg = null; toast(t('Slot {n}: {action}', { n: p.cid + 1, action: presetLabel(action) })); changed(); return;
  }
  if (p.section === 'gesture') {
    const cid = gestureControl(d), g = gestureObject(d, cid);
    let sub = typeof action === 'string' ? JSON.parse(JSON.stringify(S.presets.all[action])) : action;
    if (typeof action === 'string') sub.preset = action;
    if (sub.type === 'scroll' && !sub.amount) sub.amount = (p.slot === 'up' || p.slot === 'right') ? 360 : -360;
    g[p.slot] = sub; g.label = 'Custom gestures'; g.type = 'gesture';
    await setAssign(d, 'buttons', cid, g);
  } else {
    await setAssign(d, p.layer === 'gshift' ? 'buttons_gshift' : p.section, p.cid, action, p.profile);
  }
  if (p.drawer) { p.current = action; p.sel = null; p.selKey = null; p.cat = 'all'; p.chord = []; p.typed = ''; changed(); toast(t('Assigned {action}', { action: presetLabel(action) })); return; }
  S.dlg = null; toast(t('Assigned {action}', { action: presetLabel(action) })); changed();
}

const presetItem = k => ({ key: k, icon: PRESET_ICON[k] || ICON[(S.presets.all[k] || {}).type] || 'fa-circle-dot', label: t(S.presets.all[k].label) }); // i18n: data
// keys from the recorder: the chord so far, and whether it is still listening
function setChord(chord, recording) { if (!S.picker) return; S.picker.chord = chord; if (recording !== undefined) S.picker.recording = recording; }
// an action dropped on a gesture direction: the panel turns to that direction, then assigns it
function dropOnGesture(k, a) { S.dir = k; const p = S.picker; p.slot = SLOTS[k][1]; p.label = SLOTS[k][0]; return assignPicked(a); }
// the agent grabbing the keyboard for the recorder (X11), and letting go
const keyGrab = { start: () => api.quiet('record_start'), cancel: () => api.quiet('record_cancel') };
// the picker's sections open at first: Recommended
const PICKER_FOLD = { rec: true };
// the section just unfolded (it animates open once), read once by the view
function takeUnfolded() { const p = S.picker; if (!p) return null; const v = p.unfolded; p.unfolded = null; return v; }
// Enter in the panel's command, text or link field: that is what gets assigned
function assignTyped() { S.picker.cat = 'cmd'; return commands['pick-assign']({ data: {}, on: false }, null, dev()); }
// what its buttons do: data-act name → command, given the button's data and value (it), the
// event, the device on screen and the button's data-key
export const commands = {
  'pick': async (it, e, d, key) => {
    {
    // a folder on the ring opens straight away (its ⋯ menu removes it)
    if (it.data.ins && S.picker && S.picker.section === 'ring') { ringSelectAdd(it.data.ins); changed(); return; }
    const fc = Number(it.data.cid);
    if (it.data.section === 'ring' && ringEditorOn() && !(S.ringPath || []).length && isFolderSlot(ringSlots()[fc])) {
      S.menu = null; S.ringPath = [fc]; S.ringAnim = { kind: 'in', from: fc }; ringSelectAdd(); changed(); return;
    }
    }
    openPicker({ drawer: (S.page === 'gestures' && (it.data.section === 'ring' || it.data.section === 'gesture')) || (S.page === 'ring' && it.data.section === 'ring'), dev: it.data.dev ? S.devices.find(x => x.id === it.data.dev) : d, section: it.data.section, cid: it.data.cid === 'thumb' ? 'thumb' : Number(it.data.cid), label: it.data.label, cat: it.data.cat, profile: it.data.profile }); return;
  },
  'pick-gesture': async (it, e, d, key) => { openPicker({ drawer: S.page === 'gestures', dev: d, section: 'gesture', cid: gestureControl(d), label: SLOTS[S.dir][0], slot: it.data.slot }); return; },
  'pick-gestures': async (it, e, d, key) => {
    // this button now carries gestures: what it had for them before, else the navigation set
    const p = S.picker, dd = S.devices.find(x => x.id === p.dev) || d, g = gestureObject(dd, p.cid);
    g.type = 'gesture';
    await setAssign(dd, 'buttons', p.cid, g, p.profile);
    S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
    p.current = g; p.sel = null;
    toast(p.label ? t('Gestures on {button}', { button: p.label }) : t('Gestures on this button'));
    changed(); return;
  },
  'gest-config': async (it, e, d, key) => {
    const p = S.picker, dd = S.devices.find(x => x.id === p.dev) || d;
    fx.stopRecorder();
    // like the action ring: the panel stays and turns into the Tap gesture's actions, the
    // directions in the middle pick which one it shows; back returns to the mouse's Buttons
    S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
    S.page = 'gestures'; S.dev = dd.id; S.menu = null; S.appDetail = null;
    S.cfgFrom = 'buttons'; S.cfgKind = 'gestures'; S.cfgBack = { cid: p.cid, label: p.label, profile: p.profile };
    S.dir = 'tap';
    openPicker({ drawer: true, dev: dd, section: 'gesture', cid: p.cid, label: SLOTS.tap[0], slot: SLOTS.tap[1] });
    return;
  },
  'ring-config': async (it, e, d, key) => {
    ringTidyFolders();
    // to the ring's settings: on this mouse's Gestures & action ring page when the button can carry
    // it there, otherwise the Action ring page
    const p = S.picker, dd = S.devices.find(x => x.id === p.dev) || d, cap = dd && gestureCapable(dd).some(c => c.cid === p.cid);
    fx.stopRecorder();
    if (!cap) { go('ring'); openRingPanel(); return; }
    // the ring in the middle with its actions open on the right (the left bar folds away, as
    // with any panel); the back arrow returns to the mouse's Buttons
    // the panel stays where it is and changes to the ring's: no closing and reopening on the way
    S.holdCid = Object.assign({}, S.holdCid, { [dd.id]: p.cid });
    S.page = 'gestures'; S.dev = dd.id; S.menu = null; S.appDetail = null;
    S.cfgFrom = 'buttons'; S.cfgKind = 'ring'; S.cfgBack = { cid: p.cid, label: p.label, profile: p.profile };
    openRingPanel(dd);
    return;
  },
  'acc-toggle': async (it, e, d, key) => { const p = S.picker; p.fold = Object.assign({}, p.fold || PICKER_FOLD, { [key]: !(p.fold || PICKER_FOLD)[key] }); p.unfolded = p.fold[key] ? key : null; changed(); return; },
  'rec-open': async (it, e, d, key) => { const p = S.picker; p.q = ''; p.fold = Object.assign({}, p.fold || PICKER_FOLD, { rec: true }); p.sel = null; p.selKey = null; if (p.cat === 'key') { fx.stopRecorder(); p.recording = false; p.cat = 'all'; } else { p.cat = 'key'; p.recording = true; } changed(); return; },
  'pick-key': async (it, e, d, key) => { const p = S.picker; if (p.drawer) return assignPicked({ type: 'keystroke', keys: [key] }); p.cat = 'all'; p.sel = { type: 'keystroke', keys: [key] }; p.selKey = 'key:' + key; fx.markPicked('key', key); return; },
  'pick-cat': async (it, e, d, key) => { S.picker.cat = key; S.picker.recording = key === 'key'; changed(); return; },
  'pick-item': async (it, e, d, key) => {
    if (key.startsWith('app:')) return assignPicked(JSON.parse(JSON.stringify(APP_ACTIONS[key.slice(4)])));
    if (key === 'macro:new') { const p = S.picker; openMacro(S.devices.find(x => x.id === p.dev) || d, null, { section: p.layer === 'gshift' ? 'buttons_gshift' : p.section, cid: p.cid, profile: p.profile }); return; }
    if (key.startsWith('macro:')) { const dd = S.devices.find(x => x.id === S.picker.dev) || d, m = (((dd.config || {}).settings || {}).macros || []).find(x => x.id === key.slice(6)); if (m) return assignPicked({ type: 'macro', macro: m.id, label: m.name }); return; }
    if (key === 'wheel:keys') {
      const typedKeys = Act.typedKeys;
      prompt(t('Two keystrokes'), [{ key: 'up', label: t('Turning one way'), placeholder: 'ctrl+tab' }, { key: 'down', label: t('Turning the other way'), placeholder: 'ctrl+shift+tab' }], async v => {
        const plus = typedKeys(v.up || ''), minus = typedKeys(v.down || '');
        if (!plus || !minus) { toast(t('Type a keystroke for each way'), true); return changed(); }
        await assignPicked({ type: 'adapter', step: 120, label: `${plus.map(keyName).join(' + ')} / ${minus.map(keyName).join(' + ')}`, plus: { type: 'keystroke', keys: plus }, minus: { type: 'keystroke', keys: minus } });
      }, t('Assign'));
      return;
    }
    if (key === 'ring:profile') return assignPicked(RING_NEXT_PROFILE);
    if (key === 'ring:brightness') return assignPicked(RING_BRIGHTNESS);
    if (key === 'ring:folder') {
      if (isFolderSlot({ action: S.picker.current })) return;
      prompt(t('New folder'), [{ key: 'name', label: t('Name'), placeholder: t('Media, Windows, Apps…') }], async v => {
        const name = (v.name || '').trim() || t('Folder');
        await assignPicked({ type: 'folder', label: name, slots: [] });
        const slots = ringSlots(); slots[S.picker.cid].label = name; slots[S.picker.cid].icon = 'fa-folder'; await saveRingSlots(slots); changed();
      }, t('Create'));
      return;
    }
    if (S.picker.drawer) return assignPicked(key); S.picker.sel = key; fx.markPicked('item', key, S.picker.drawer); return;
  },
  'rec-start': async (it, e, d, key) => { if (S.picker.drawer) S.picker.cat = 'key'; if (S.picker.recording) return; S.picker.recording = true; changed(); return; },
  'pick-launch': async (it, e, d, key) => { if (S.picker.drawer) { S.picker.cat = 'app'; S.picker.launch = key; S.picker.cmd = S.picker.text = S.picker.open = ''; return commands['pick-assign']({ data: {}, on: false }, null, d); } S.picker.launch = key; S.picker.cmd = ''; S.picker.text = ''; S.picker.open = ''; if (S.picker.cat === 'app') fx.refreshAppList(); else changed(); return; },
  'pick-disable': async (it, e, d, key) => { await assignPicked('nothing'); return; },
  'pick-default': async (it, e, d, key) => {
    const p = S.picker; const dd = S.devices.find(x => x.id === p.dev) || d;
    if (p.section === 'ring') { const slots = ringSlots(); slots[p.cid] = null; await saveRingSlots(slots); S.dlg = null; toast(t('Slot {n} cleared', { n: p.cid + 1 })); changed(); return; }
    const defs = ((await api.quiet('defaults', { id: dd.id })).profiles || {}).default || {};
    let a;
    if (p.section === 'thumbwheel') a = defs.thumbwheel || 'native';
    else if (p.section === 'gesture') a = 'nothing';
    else a = (defs[p.section] || {})[String(p.cid)] || 'native';
    if (p.profile && p.profile !== 'default') { const profs = JSON.parse(JSON.stringify(dd.config.profiles)); if (profs[p.profile] && profs[p.profile][p.section]) { delete profs[p.profile][p.section][String(p.cid)]; merge(await call('set_profiles', { id: dd.id, profiles: profs })); } S.picker = null; toast(t('Override removed, follows All applications')); changed(); return; }
    await assignPicked(a); return;
  },
  'pick-assign': async (it, e, d, key) => {
    const p = S.picker;
    if (p.cat === 'key') {
      const typed = (p.typed || '').trim();
      if (typed) { fx.stopRecorder(); return assignPicked({ type: 'keystroke', keys: Act.typedKeys(typed) }); }
      // whatever the box shows is what the user wants, whether or not the recorder saw a release
      if ((p.chord || []).length) { fx.stopRecorder(); p.recording = false; return assignPicked({ type: 'keystroke', keys: p.chord.slice() }); }
      return toast(t('Record or type a keystroke first'), true);
    }
    if (p.cat === 'cmd') { if (p.cmd) return assignPicked({ type: 'command', cmd: p.cmd, label: 'Run: ' + p.cmd }); if (p.text) return assignPicked({ type: 'type_text', text: p.text }); if (p.open) return assignPicked({ type: 'open', target: p.open, label: 'Open ' + p.open.replace(/^https?:\/\//, '').slice(0, 24) }); return toast(t('Enter a command, text or target'), true); }
    if (p.cat === 'app') {
      if (!p.launch) return toast(t('Pick an application first'), true);
      const a = (S.apps || []).concat(S.running || []).find(x => x.id === p.launch);
      if (a && a.url) return assignPicked({ type: 'open', target: a.url, label: a.name });
      return assignPicked({ type: 'launch', app: p.launch, label: a ? a.name : p.launch });
    }
    if (p.sel) return assignPicked(p.sel);
    return toast(t('Pick an action first'), true);
  },
};

export const provide = { openRingPanel, PICKER_CATS, CAT_OF, CAT_LABEL, pickerItems, OPTS_CARD, RECOMMEND, MOUSE_RECOMMEND, AK, AW, APP_ACTIONS, BROWSER, OFFICE, CALL, APP_SETS, appSet, appLabel, recItem, MOUSE_GROUP, WHEEL_GROUP, K, keyRange, keyGroups, OPTS_CATS, DRAWER_SECTIONS, ACTION_GROUPS, groupsFor, sectionsFor, KEY_GROUP_NAMES, curOf, keyCur, RING_RECOMMEND, RING_DRAG, RING_WHEEL, easyLabel, GESTURE_RECOMMEND, GESTURE_TYPES, allowedFor, drawerItems, openPicker, assignPicked, presetItem, setChord, dropOnGesture, keyGrab, PICKER_FOLD, takeUnfolded, assignTyped };
